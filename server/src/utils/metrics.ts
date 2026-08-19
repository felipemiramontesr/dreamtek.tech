/**
 * OpenMetrics / Prometheus Metrics Registry
 * FC 001n — High Performance Zero-Dependency Prometheus Exporter
 */

interface MetricLabel {
  key: string;
  value: string;
}

interface CounterEntry {
  labels: Record<string, string>;
  value: number;
}

interface GaugeEntry {
  labels: Record<string, string>;
  value: number;
}

interface HistogramBucket {
  le: number;
  count: number;
}

interface HistogramEntry {
  labels: Record<string, string>;
  buckets: HistogramBucket[];
  sum: number;
  count: number;
}

const DEFAULT_LATENCY_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

class MetricsRegistry {
  private counters: Map<string, CounterEntry[]> = new Map();
  private gauges: Map<string, GaugeEntry[]> = new Map();
  private histograms: Map<string, { bucketsConfig: number[]; entries: HistogramEntry[] }> =
    new Map();

  constructor() {
    this.initDefaultMetrics();
  }

  private initDefaultMetrics() {
    this.counters.set('http_requests_total', []);
    this.histograms.set('http_request_duration_seconds', {
      bucketsConfig: DEFAULT_LATENCY_BUCKETS,
      entries: [],
    });
  }

  private formatLabels(labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return '';
    const formatted = Object.entries(labels)
      .map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`)
      .join(',');
    return `{${formatted}}`;
  }

  private matchLabels(a?: Record<string, string>, b?: Record<string, string>): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => a[key] === b[key]);
  }

  public incCounter(name: string, labels: Record<string, string> = {}, value = 1): void {
    const list = this.counters.get(name) || [];
    const existing = list.find((e) => this.matchLabels(e.labels, labels));
    if (existing) {
      existing.value += value;
    } else {
      list.push({ labels, value });
    }
    this.counters.set(name, list);
  }

  public setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const list = this.gauges.get(name) || [];
    const existing = list.find((e) => this.matchLabels(e.labels, labels));
    if (existing) {
      existing.value = value;
    } else {
      list.push({ labels, value });
    }
    this.gauges.set(name, list);
  }

  public observeHistogram(
    name: string,
    durationSeconds: number,
    labels: Record<string, string> = {},
  ): void {
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

  public recordHttpRequest(
    method: string,
    route: string,
    status: number,
    durationSeconds: number,
  ): void {
    const labels = { method: method.toUpperCase(), route, status: String(status) };
    this.incCounter('http_requests_total', labels, 1);
    this.observeHistogram('http_request_duration_seconds', durationSeconds, labels);
  }

  public recordCacheHit(layer: 'L1' | 'L2'): void {
    this.incCounter('cache_hits_total', { layer }, 1);
  }

  public recordCacheMiss(layer: 'L1' | 'L2'): void {
    this.incCounter('cache_misses_total', { layer }, 1);
  }

  public getPrometheusMetrics(): string {
    const lines: string[] = [];

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

  public resetMetricsForTest(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.initDefaultMetrics();
  }
}

export const metricsRegistry = new MetricsRegistry();
