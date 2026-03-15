/**
 * RequestManager — tracks a single in-flight AI request.
 *
 * Calling `start()` aborts the previous controller (if any) and returns a new
 * AbortSignal. This prevents stale responses from overwriting fresher ones when
 * the user keeps typing faster than the AI responds.
 */
class RequestManager {
    private controller: AbortController | null = null;

    /** Abort any in-flight request and return a signal for the new one. */
    start(): AbortSignal {
        this.controller?.abort();
        this.controller = new AbortController();
        return this.controller.signal;
    }

    /** Manually abort without starting a new request (e.g. on tab close). */
    abort(): void {
        this.controller?.abort();
        this.controller = null;
    }
}

// Singleton — shared across all editor instances in the same tab
export const requestManager = new RequestManager();
