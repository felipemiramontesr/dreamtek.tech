"use strict";
/**
 * OpenMetrics / Prometheus Metrics Registry
 * FC 001n — High Performance Zero-Dependency Prometheus Exporter
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.metricsRegistry = void 0;
const DEFAULT_LATENCY_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];
class MetricsRegistry {
    counters = new Map();
    gauges = new Map();
    histograms = new Map();
    constructor() {
        this.initDefaultMetrics();
    }
    initDefaultMetrics() {
        this.counters.set('http_requests_total', []);
        this.histograms.set('http_request_duration_seconds', {
            bucketsConfig: DEFAULT_LATENCY_BUCKETS,
            entries: [],
        });
    }
    formatLabels(labels) {
        if (!labels || Object.keys(labels).length === 0)
            return '';
        const formatted = Object.entries(labels)
            .map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`)
            .join(',');
        return `{${formatted}}`;
    }
    matchLabels(a, b) {
        if (!a && !b)
            return true;
        if (!a || !b)
            return false;
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length)
            return false;
        return keysA.every((key) => a[key] === b[key]);
    }
    incCounter(name, labels = {}, value = 1) {
        const list = this.counters.get(name) || [];
        const existing = list.find((e) => this.matchLabels(e.labels, labels));
        if (existing) {
            existing.value += value;
        }
        else {
            list.push({ labels, value });
        }
        this.counters.set(name, list);
    }
    setGauge(name, value, labels = {}) {
        const list = this.gauges.get(name) || [];
        const existing = list.find((e) => this.matchLabels(e.labels, labels));
        if (existing) {
            existing.value = value;
        }
        else {
            list.push({ labels, value });
        }
        this.gauges.set(name, list);
    }
    observeHistogram(name, durationSeconds, labels = {}) {
        let histo = this.histograms.get(name);
        if (!histo) {
            histo = { bucketsConfig: DEFAULT_LATENCY_BUCKETS, entries: [] };
            this.histograms.set(name, histo);
        }
        let entry = histo.entries.find((e) => this.matchLabels(e.labels, labels));
        if (!entry) {
            entry = {
                labels,
                buckets: histo.bucketsConfig.map((le) => ({ le, count: 0 })),
                sum: 0,
                count: 0,
            };
            histo.entries.push(entry);
        }
        entry.sum += durationSeconds;
        entry.count += 1;
        for (const b of entry.buckets) {
            if (durationSeconds <= b.le) {
                b.count += 1;
            }
        }
    }
    recordHttpRequest(method, route, status, durationSeconds) {
        const labels = { method: method.toUpperCase(), route, status: String(status) };
        this.incCounter('http_requests_total', labels, 1);
        this.observeHistogram('http_request_duration_seconds', durationSeconds, labels);
    }
    recordCacheHit(layer) {
        this.incCounter('cache_hits_total', { layer }, 1);
    }
    recordCacheMiss(layer) {
        this.incCounter('cache_misses_total', { layer }, 1);
    }
    getPrometheusMetrics() {
        const lines = [];
        // Export Counters
        for (const [name, entries] of this.counters.entries()) {
            lines.push(`# HELP ${name} Total count of ${name}`);
            lines.push(`# TYPE ${name} counter`);
            for (const entry of entries) {
                lines.push(`${name}${this.formatLabels(entry.labels)} ${entry.value}`);
            }
        }
        // Export Gauges
        for (const [name, entries] of this.gauges.entries()) {
            lines.push(`# HELP ${name} Current value of ${name}`);
            lines.push(`# TYPE ${name} gauge`);
            for (const entry of entries) {
                lines.push(`${name}${this.formatLabels(entry.labels)} ${entry.value}`);
            }
        }
        // Export Histograms
        for (const [name, histo] of this.histograms.entries()) {
            lines.push(`# HELP ${name} Histogram of ${name}`);
            lines.push(`# TYPE ${name} histogram`);
            for (const entry of histo.entries) {
                for (const bucket of entry.buckets) {
                    const bucketLabels = { ...entry.labels, le: String(bucket.le) };
                    lines.push(`${name}_bucket${this.formatLabels(bucketLabels)} ${bucket.count}`);
                }
                const infLabels = { ...entry.labels, le: '+Inf' };
                lines.push(`${name}_bucket${this.formatLabels(infLabels)} ${entry.count}`);
                lines.push(`${name}_sum${this.formatLabels(entry.labels)} ${entry.sum.toFixed(6)}`);
                lines.push(`${name}_count${this.formatLabels(entry.labels)} ${entry.count}`);
            }
        }
        return lines.join('\n') + (lines.length > 0 ? '\n' : '');
    }
    resetMetricsForTest() {
        this.counters.clear();
        this.gauges.clear();
        this.histograms.clear();
        this.initDefaultMetrics();
    }
}
exports.metricsRegistry = new MetricsRegistry();
