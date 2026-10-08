import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiStatus } from '../components/api-status';
import { jsonResponse, stubPendingFetch } from './fetch-mock';

const health = {
  service: 'sync-api',
  status: 'ok',
  time: '2026-10-08T10:00:00.000Z',
  uptimeSeconds: 42,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('<ApiStatus />', () => {
  it('shows a loading state while the request is in flight', () => {
    stubPendingFetch();
    render(<ApiStatus apiBaseUrl="http://api.test" />);

    expect(screen.getByRole('status').textContent).toMatch(/Checking/);
    expect(screen.queryByText('API reachable')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows success from a valid response without overclaiming', async () => {
    const { calls } = stubPendingFetch();
    render(<ApiStatus apiBaseUrl="http://api.test" />);

    await act(async () => calls[0]!.respond(jsonResponse(health)));

    expect(screen.getByText('API reachable')).toBeTruthy();
    expect(screen.getByText('sync-api')).toBeTruthy();
    expect(screen.getByText('42 s')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/does not mean Sync is operational/);
    expect(calls[0]!.url).toBe('http://api.test/api/health');
  });

  it('shows a safe error with the request ID when the API rejects the call', async () => {
    const { calls } = stubPendingFetch();
    render(<ApiStatus apiBaseUrl="http://api.test" />);

    await act(async () =>
      calls[0]!.respond(
        jsonResponse(
          {
            error: {
              code: 'INTERNAL_ERROR',
              message: 'An unexpected error occurred.',
              requestId: 'req-12345678',
            },
          },
          { status: 500 },
        ),
      ),
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('API unavailable');
    expect(alert.textContent).toContain('An unexpected error occurred.');
    expect(alert.textContent).toContain('req-12345678');
    expect(screen.queryByText('API reachable')).toBeNull();
  });

  it('shows unavailable when the API cannot be reached', async () => {
    const { calls } = stubPendingFetch();
    render(<ApiStatus apiBaseUrl="http://api.test" />);

    await act(async () => calls[0]!.fail(new TypeError('fetch failed')));

    expect(screen.getByRole('alert').textContent).toMatch(/could not be reached/);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('recovers when the user retries, and never retries by itself', async () => {
    const { calls, mock } = stubPendingFetch();
    render(<ApiStatus apiBaseUrl="http://api.test" />);
    await act(async () => calls[0]!.fail(new TypeError('fetch failed')));

    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(mock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByRole('status').textContent).toMatch(/Checking/);
    expect(mock).toHaveBeenCalledTimes(2);

    await act(async () => calls[1]!.respond(jsonResponse(health)));

    expect(screen.getByText('API reachable')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ignores clicks while a check is already running', () => {
    const { mock } = stubPendingFetch();
    render(<ApiStatus apiBaseUrl="http://api.test" />);

    const button = screen.getByRole('button', { name: 'Checking…' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);

    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('aborts the in-flight request on unmount', () => {
    const { calls } = stubPendingFetch();
    const { unmount } = render(<ApiStatus apiBaseUrl="http://api.test" />);

    unmount();

    expect(calls[0]!.signal.aborted).toBe(true);
  });

  it('does not let a late response for an obsolete target overwrite newer state', async () => {
    // The mock keeps the old request alive after abort, as a slow real response would.
    const { calls } = stubPendingFetch({ honorAbort: false });
    const { rerender } = render(<ApiStatus apiBaseUrl="http://old.test" />);

    rerender(<ApiStatus apiBaseUrl="http://new.test" />);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.signal.aborted).toBe(true);

    await act(async () => calls[1]!.fail(new TypeError('fetch failed')));
    expect(screen.getByRole('alert')).toBeTruthy();

    // The obsolete request now "succeeds" late; the UI must keep showing the newer failure.
    await act(async () => calls[0]!.respond(jsonResponse(health)));

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText('API reachable')).toBeNull();
  });
});
