import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { metricsRegistry } from '../../../server/src/utils/metrics';
import { normalizeRoutePath, metricsMiddleware } from '../../../server/src/middleware/metrics';
import { isMetricsAuthorized, METRICS_SECRET_TOKEN } from '../../../server/src/routes/metrics';
import app from '../../../server/src/index';
import { Request, Response, NextFunction } from 'express';

describe('Prometheus Metrics Engine & Middleware (FC 001n)', () => {
  beforeEach(() => {
    metricsRegistry.resetMetricsForTest();
  });

  describe('MetricsRegistry Unit Tests', () => {
    it('should increment counters and export openmetrics format', () => {
      metricsRegistry.incCounter('http_requests_total', { method: 'GET', route: '/health' });
      metricsRegistry.incCounter('http_requests_total', { method: 'GET', route: '/health' });

      const metricsText = metricsRegistry.getPrometheusMetrics();
      expect(metricsText).toContain('# HELP http_requests_total');
      expect(metricsText).toContain('# TYPE http_requests_total counter');
      expect(metricsText).toContain('http_requests_total{method="GET",route="/health"} 2');
    });

    it('should set gauges and update existing values', () => {
      metricsRegistry.setGauge('active_connections', 5, { pool: 'mariadb' });
      metricsRegistry.setGauge('active_connections', 10, { pool: 'mariadb' });

      const metricsText = metricsRegistry.getPrometheusMetrics();
      expect(metricsText).toContain('# HELP active_connections');
      expect(metricsText).toContain('# TYPE active_connections gauge');
      expect(metricsText).toContain('active_connections{pool="mariadb"} 10');
    });

    it('should observe histogram values and calculate buckets', () => {
      metricsRegistry.observeHistogram('http_request_duration_seconds', 0.02, {
        route: '/api/v1/checkout',
      });
      metricsRegistry.observeHistogram('http_request_duration_seconds', 0.5, {
        route: '/api/v1/checkout',
      });

      const metricsText = metricsRegistry.getPrometheusMetrics();
      expect(metricsText).toContain(
        'http_request_duration_seconds_bucket{route="/api/v1/checkout",le="0.025"} 1',
      );
      expect(metricsText).toContain(
        'http_request_duration_seconds_bucket{route="/api/v1/checkout",le="1"} 2',
      );
      expect(metricsText).toContain(
        'http_request_duration_seconds_sum{route="/api/v1/checkout"} 0.520000',
      );
      expect(metricsText).toContain(
        'http_request_duration_seconds_count{route="/api/v1/checkout"} 2',
      );
    });

    it('should record cache hit and miss events correctly', () => {
      metricsRegistry.recordCacheHit('L1');
      metricsRegistry.recordCacheHit('L2');
      metricsRegistry.recordCacheMiss('L1');
      metricsRegistry.recordCacheMiss('L2');

      const metricsText = metricsRegistry.getPrometheusMetrics();
      expect(metricsText).toContain('cache_hits_total{layer="L1"} 1');
      expect(metricsText).toContain('cache_hits_total{layer="L2"} 1');
      expect(metricsText).toContain('cache_misses_total{layer="L1"} 1');
      expect(metricsText).toContain('cache_misses_total{layer="L2"} 1');
    });

    it('should format labels with quotes escaped properly', () => {
      metricsRegistry.incCounter('test_counter', { label_with_quotes: 'val"ue' });
      const metricsText = metricsRegistry.getPrometheusMetrics();
      expect(metricsText).toContain('test_counter{label_with_quotes="val\\"ue"} 1');
    });

    it('should handle unlabelled counters and gauges', () => {
      metricsRegistry.incCounter('unlabelled_counter');
      metricsRegistry.setGauge('unlabelled_gauge', 42);

      const metricsText = metricsRegistry.getPrometheusMetrics();
      expect(metricsText).toContain('unlabelled_counter 1');
      expect(metricsText).toContain('unlabelled_gauge 42');
    });
  });

  describe('Route Normalization & Middleware (C-N3)', () => {
    it('should normalize empty or null paths to "/"', () => {
      expect(normalizeRoutePath('')).toBe('/');
    });

    it('should strip query parameters and replace UUIDs and IDs with placeholders', () => {
      const rawPath = '/api/v1/users/12345/orders/550e8400-e29b-41d4-a716-446655440000?sort=desc';
      const normalized = normalizeRoutePath(rawPath);
      expect(normalized).toBe('/api/v1/users/:id/orders/:id');
    });

    it('should replace long hex tokens', () => {
      const rawPath = '/api/v1/reset-token/a1b2c3d4e5f67890a1b2c3d4e5f67890';
      const normalized = normalizeRoutePath(rawPath);
      expect(normalized).toBe('/api/v1/reset-token/:token');
    });

    it('should record request duration and status on res finish event', async () => {
      const req = { method: 'GET', baseUrl: '/api/v1', path: '/health' } as unknown as Request;
      const listeners: Record<string, () => void> = {};
      const res = {
        statusCode: 200,
        on: (event: string, cb: () => void) => {
          listeners[event] = cb;
        },
      } as unknown as Response;
      const next: NextFunction = vi.fn();

      metricsMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();

      // Trigger finish event
      listeners['finish']();

      const metricsText = metricsRegistry.getPrometheusMetrics();
      expect(metricsText).toContain(
        'http_requests_total{method="GET",route="/api/v1/health",status="200"} 1',
      );
    });

    it('should observe histogram values for new uninitialized metric names', () => {
      metricsRegistry.observeHistogram('custom_new_histogram', 1.5, { tag: 'test' });
      const metricsText = metricsRegistry.getPrometheusMetrics();
      expect(metricsText).toContain('# HELP custom_new_histogram');
      expect(metricsText).toContain('custom_new_histogram_sum{tag="test"} 1.500000');
    });

    it('should fallback to empty string when path and originalUrl are undefined in middleware', () => {
      const req = { method: 'GET', baseUrl: '' } as unknown as Request;
      const listeners: Record<string, () => void> = {};
      const res = {
        statusCode: 200,
        on: (event: string, cb: () => void) => {
          listeners[event] = cb;
        },
      } as unknown as Response;
      const next: NextFunction = vi.fn();

      metricsMiddleware(req, res, next);
      listeners['finish']();

      const metricsText = metricsRegistry.getPrometheusMetrics();
      expect(metricsText).toContain('http_requests_total{method="GET",route="/",status="200"} 1');
    });
  });

  describe('Metrics Route Security & Authorization (C-N2)', () => {
    it('should reject unauthenticated request to /api/v1/metrics with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/metrics');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('Unauthorized');
    });

    it('should reject request to /metrics with invalid Bearer token with 401 Unauthorized', async () => {
      const res = await request(app)
        .get('/metrics')
        .set('Authorization', 'Bearer invalid-secret-token');
      expect(res.status).toBe(401);
    });

    it('should allow access to /api/v1/metrics with valid Bearer token', async () => {
      const res = await request(app)
        .get('/api/v1/metrics')
        .set('Authorization', `Bearer ${METRICS_SECRET_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.text).toContain('# HELP http_requests_total');
    });

    it('should authorize request if user has ADMIN role', () => {
      const adminReq = {
        headers: {},
        user: { role: 'ADMIN' },
      } as unknown as Request;

      expect(isMetricsAuthorized(adminReq)).toBe(true);
    });

    it('should reject request if user role is CLIENT without valid Bearer token', () => {
      const clientReq = {
        headers: {},
        user: { role: 'CLIENT' },
      } as unknown as Request;

      expect(isMetricsAuthorized(clientReq)).toBe(false);
    });
  });
});
