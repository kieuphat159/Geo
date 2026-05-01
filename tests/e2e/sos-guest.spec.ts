import { expect, test, type Page } from "@playwright/test";

const PHONE = "84915846339";
const supportedVictim = { lat: 10.78, lng: 106.66 };
const outsideVictim = { lat: 9.9, lng: 106.6 };

async function attachSosClientId(page: Page, clientId: string) {
    await page.route("**/api/emergency/sos", (route) => {
        return route.continue({
            headers: {
                ...route.request().headers(),
                "x-client-id": clientId,
            },
        });
    });
}

async function mockGeolocation(
    page: Page,
    coords: { lat: number; lng: number } | null,
    errorCode?: number,
) {
    await page.addInitScript(
        ({ coords, errorCode }) => {
            // Override geolocation API so tests don't depend on browser permission prompts.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const geo: any = {
                getCurrentPosition: (success: any, error: any) => {
                    if (!coords) {
                        error?.({ code: errorCode ?? 1 });
                        return;
                    }

                    success?.({
                        coords: {
                            latitude: coords.lat,
                            longitude: coords.lng,
                        },
                    });
                },
            };

            // navigator.geolocation is often read-only; override via defineProperty.
            Object.defineProperty(navigator, "geolocation", {
                value: geo,
                configurable: true,
            });
        },
        { coords, errorCode },
    );
}

function parseEtaMinutesFromText(text: string): number | null {
    // "Xe cứu thương cách bạn ~12 phút"
    const match = text.match(/~\s*(\d+)\s*phút/i);
    if (!match) return null;
    return Number(match[1]);
}

async function expectRoutePathRendered(page: any) {
    // Leaflet Polyline uses SVG path elements.
    const hasRoute = await page.evaluate(() => {
        const paths = Array.from(document.querySelectorAll("path.leaflet-interactive"));
        return paths.some((p) => {
            const stroke = (p.getAttribute("stroke") || "").toLowerCase();
            return stroke.includes("2563eb") || stroke.includes("37, 99, 235") || stroke.includes("rgb(37, 99, 235)");
        });
    });

    expect(hasRoute).toBeTruthy();
}

test.describe("TC04–TC07 SOS (Guest)", () => {
    test("TC04 - Gửi SOS - Có quyền GPS", async ({ page }) => {
        const clientId = `e2e-${Math.random().toString(36).slice(2)}`;
        await attachSosClientId(page, clientId);
        await mockGeolocation(page, supportedVictim);

        await page.goto("/user");

        await expect(page.getByRole("button", { name: "Emergency SOS" })).toBeVisible();
        await page.getByRole("button", { name: "Emergency SOS" }).click();

        await expect(page.getByRole("dialog")).toBeVisible();
        await expect(page.getByText("Xác nhận gửi yêu cầu SOS")).toBeVisible();

        await page.getByLabel("Số điện thoại nạn nhân").fill(PHONE);

        const [sosResponse] = await Promise.all([
            page.waitForResponse("**/api/emergency/sos"),
            page.getByRole("button", { name: "Confirm & Send SOS" }).click(),
        ]);

        expect(sosResponse.status()).toBe(201);

        const json = (await sosResponse.json()) as any;
        await expect(page.getByText("Yêu cầu SOS đã được gửi!")).toBeVisible();
        await expect(page.getByText(/Đang chờ điều xe\.\.\./i).first()).toBeVisible();

        await expectRoutePathRendered(page);

        const statusText = await page.getByText(/Xe cứu thương cách bạn/i).first().textContent();
        const displayedEta = statusText ? parseEtaMinutesFromText(statusText) : null;
        expect(displayedEta).not.toBeNull();

        const actualEtaMinutes = Number(json.eta_minutes);
        const actual = actualEtaMinutes > 0 ? actualEtaMinutes : 1;
        const diffRatio = Math.abs((displayedEta as number) - actual) / actual;
        expect(diffRatio).toBeLessThan(0.12);
    });

    test("TC05 - Gửi SOS - Từ chối GPS", async ({ page }) => {
        await mockGeolocation(page, null, 1);

        await page.goto("/user");
        await page.getByRole("button", { name: "Emergency SOS" }).click();

        // Backend shouldn't be called, and modal should not open.
        await expect(
            page.locator("p.font-semibold.text-red-700", { hasText: "Cần cấp quyền GPS để sử dụng tính năng này." }).first(),
        ).toBeVisible();
        await expect(page.getByText("Xác nhận gửi yêu cầu SOS")).toHaveCount(0);
    });

    test("TC06 - SOS ngoài phạm vi", async ({ page }) => {
        const clientId = `e2e-${Math.random().toString(36).slice(2)}`;
        await attachSosClientId(page, clientId);
        await mockGeolocation(page, outsideVictim);

        await page.goto("/user");
        await page.getByRole("button", { name: "Emergency SOS" }).click();

        await expect(page.getByRole("dialog")).toBeVisible();
        await page.getByLabel("Số điện thoại nạn nhân").fill(PHONE);

        const [sosResponse] = await Promise.all([
            page.waitForResponse("**/api/emergency/sos"),
            page.getByRole("button", { name: "Confirm & Send SOS" }).click(),
        ]);

        expect(sosResponse.status()).toBe(400);

        const modalErrorText = await page.locator("text=Vị trí nằm ngoài vùng hỗ trợ").first();
        await expect(modalErrorText).toBeVisible();
    });

    test("TC07 - Định tuyến (Routing) + LineString không thẳng", async ({ page }) => {
        const clientId = `e2e-${Math.random().toString(36).slice(2)}`;
        await attachSosClientId(page, clientId);
        await mockGeolocation(page, supportedVictim);

        await page.goto("/user");
        await page.getByRole("button", { name: "Emergency SOS" }).click();

        await expect(page.getByRole("dialog")).toBeVisible();
        await page.getByLabel("Số điện thoại nạn nhân").fill(PHONE);

        const [sosResponse] = await Promise.all([
            page.waitForResponse("**/api/emergency/sos"),
            page.getByRole("button", { name: "Confirm & Send SOS" }).click(),
        ]);

        expect(sosResponse.status()).toBe(201);
        const json = (await sosResponse.json()) as any;

        // TC07: lineString should be routed (not just 2 points)
        const coords = json?.route_path?.coordinates as Array<[number, number]> | undefined;
        expect(coords).toBeDefined();
        expect(coords.length).toBeGreaterThan(2);

        await expectRoutePathRendered(page);

        const statusText = await page.getByText(/Xe cứu thương cách bạn/i).first().textContent();
        const displayedEta = statusText ? parseEtaMinutesFromText(statusText) : null;
        expect(displayedEta).not.toBeNull();

        const actualEtaMinutes = Number(json.eta_minutes);
        const actual = actualEtaMinutes > 0 ? actualEtaMinutes : 1;
        const diffRatio = Math.abs((displayedEta as number) - actual) / actual;
        expect(diffRatio).toBeLessThan(0.12);
    });
});

