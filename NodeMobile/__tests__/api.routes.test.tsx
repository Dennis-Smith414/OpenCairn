// __tests__/api.routes.test.tsx
import { fetchRouteList } from "../src/lib/api";

describe("fetchRouteList()", () => {
  let originalFetch: any;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // Default: happy path with two items
    (globalThis as any).fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: async () =>
          JSON.stringify({
            items: [
              { id: 1, name: "Ice Age Trail – Kettle Moraine", region: "WI" },
              { id: 2, name: "Devil's Lake Loop", region: "WI" },
            ],
          }),
      })
    );
  });

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
    jest.clearAllMocks();
  });

  it("calls /api/routes/list and returns items (happy path)", async () => {
    const items = await fetchRouteList();

    expect((globalThis as any).fetch).toHaveBeenCalledTimes(1);
    const urlArg = ((globalThis as any).fetch as jest.Mock).mock.calls[0][0] as string;
    expect(urlArg).toMatch(/\/api\/routes\/list/);

    expect(items).toHaveLength(2);
    expect(items[0].name).toBe("Ice Age Trail – Kettle Moraine");
  });

  it("throws when the server responds with a non-OK status", async () => {
    (globalThis as any).fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        text: async () => "Server error",
      })
    );

    await expect(fetchRouteList()).rejects.toThrow();
  });

  it("throws when fetch itself throws (synchronous error)", async () => {
    (globalThis as any).fetch = jest.fn(() => {
      throw new Error("Network failure");
    });

    await expect(fetchRouteList()).rejects.toThrow("Network failure");
  });

  it("throws when fetch itself rejects (async error)", async () => {
    (globalThis as any).fetch = jest.fn(() => Promise.reject(new Error("Network down")));

    await expect(fetchRouteList()).rejects.toThrow("Network down");
    expect((globalThis as any).fetch).toHaveBeenCalledTimes(1);
  });

  it("returns [] when the JSON has an empty items array", async () => {
    (globalThis as any).fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: async () => JSON.stringify({ items: [] }),
      })
    );

    const items = await fetchRouteList();
    expect(Array.isArray(items)).toBe(true);
    expect(items).toHaveLength(0);
  });

  it("returns [] when the JSON has no items property", async () => {
    (globalThis as any).fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: async () => JSON.stringify({}),
      })
    );

    const items = await fetchRouteList();
    expect(items).toEqual([]);
  });

  it("throws a clear error when the API returns invalid JSON", async () => {
    (globalThis as any).fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: async () => "NOT_VALID_JSON",
      })
    );

    await expect(fetchRouteList()).rejects.toThrow(/Bad JSON from \/routes\/list/i);
  });

  it("throws a clear error when fetch returns empty text", async () => {
    (globalThis as any).fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: async () => "",
      })
    );

    await expect(fetchRouteList()).rejects.toThrow(/Bad JSON from \/routes\/list/i);
  });

  it("preserves order of items from the backend", async () => {
    (globalThis as any).fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: async () =>
          JSON.stringify({
            items: [
              { id: 1, name: "A" },
              { id: 2, name: "B" },
              { id: 3, name: "C" },
            ],
          }),
      })
    );

    const items = await fetchRouteList();
    expect(items.map((r: { id: number }) => r.id)).toEqual([1, 2, 3]);
  });

  it("preserves extra unknown properties in the API response", async () => {
    (globalThis as any).fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: async () =>
          JSON.stringify({
            items: [{ id: 10, name: "Hidden Falls", region: "MN", extra: "unused" }],
          }),
      })
    );

    const items = await fetchRouteList();
    expect(items[0].id).toBe(10);
    expect(items[0].name).toBe("Hidden Falls");
    expect(items[0]).toHaveProperty("extra", "unused"); // passthrough behavior
  });

  it("allows numeric string ids if the backend sends them", async () => {
    (globalThis as any).fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: async () =>
          JSON.stringify({
            items: [{ id: "5", name: "Numeric Trail", region: "WI" }],
          }),
      })
    );

    const items = await fetchRouteList();
    expect(items[0].id).toBe("5"); // no coercion performed by helper
    expect(items[0].name).toBe("Numeric Trail");
  });
});
