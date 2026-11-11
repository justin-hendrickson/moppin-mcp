import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

const appId = "11111111-1111-4111-8111-111111111111";
const siteId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";
const signedImage =
  "https://bytescale.mobbin.com/FW25bBB/image/mobbin.com/prod/file.webp?enc=preserve-this-signature";
let requests = [];
let respond;
const server = createServer(async (req, res) => {
  let text = "";
  for await (const chunk of req) text += chunk;
  const body = text ? JSON.parse(text) : undefined;
  requests.push({ path: req.url, body, cookiePresent: !!req.headers.cookie });
  const response = respond(req.url, body);
  res.writeHead(response.status ?? 200, {
    "Content-Type": typeof response.body === "string" ? "text/html" : "application/json",
  });
  res.end(typeof response.body === "string" ? response.body : JSON.stringify(response.body));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
process.env.MOBBIN_BASE_URL = `http://127.0.0.1:${server.address().port}`;
const { MobbinAuth } = await import("../dist/services/auth.js");
const { MobbinApiClient } = await import("../dist/services/api-client.js");
const { formatSiteSections } = await import("../dist/utils/formatting.js");
after(() => new Promise((resolve) => server.close(resolve)));
beforeEach(() => {
  requests = [];
});

function client() {
  return new MobbinApiClient(
    MobbinAuth.fromSession({
      access_token: "local-fixture",
      refresh_token: "local-fixture",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "local-fixture", email: "fixture@example.invalid" },
    }),
  );
}
const site = {
  id: siteId,
  name: "Wise",
  tagline: "Money without borders",
  logoCdnImgSources: { src: signedImage },
};
const app = {
  id: appId,
  platform: "web",
  appName: "Revolut",
  appLogoUrl: signedImage,
  appTagline: "Finance",
  previewScreens: [{ id: "preview", screenCdnImgSources: { src: signedImage } }],
  appVersionId: versionId,
  isRestricted: true,
};
const section = {
  id: "allowed-section",
  type: "custom_image",
  page_url: null,
  page_image_url: "https://example.invalid/old.png",
  cdnImgSources: { src: signedImage },
  pageCdnImgSources: { src: signedImage },
  restricted: false,
  patterns: ["Hero Section"],
  metadata: { width: 1440, height: 900 },
};
function rsc(sections) {
  return `<script>self.__next_f.push([1,${JSON.stringify("0:" + JSON.stringify({ sections }))}])</script>`;
}

test("current discovery catalogs paginate, deduplicate, normalize images and cache completed reads", async () => {
  respond = (path, body) => {
    assert.equal(path, "/api/discover/fetch-discover-page-apps");
    assert.equal(body.platform, "web");
    return {
      body: {
        value: {
          data: body.pageIndex === 0 ? [app] : [app, { ...app, id: "other-app" }],
          hasNextPage: body.pageIndex === 0,
        },
      },
    };
  };
  const c = client();
  const apps = await c.getSearchableApps("web");
  assert.equal(apps.length, 2);
  assert.equal(apps[0].previewScreens[0].screenUrl, signedImage);
  assert.equal(apps[0].appVersionId, versionId);
  assert.equal(apps[0].isRestricted, true);
  await c.getSearchableApps("web");
  assert.equal(requests.length, 2);
  assert.ok(requests.every((r) => r.cookiePresent));
});

test("site search finds a matching site on a later discovery page", async () => {
  respond = (path, body) => {
    assert.equal(path, "/api/discover/fetch-discover-page-sites");
    return {
      body: {
        value: {
          data:
            body.pageIndex === 0
              ? [{ ...site, id: "other", name: "Example", tagline: "" }]
              : [site],
          hasNextPage: body.pageIndex === 0,
        },
      },
    };
  };
  const sites = await client().searchSites({ query: "Wise", pageSize: 1 });
  assert.deepEqual(
    sites.map((s) => s.id),
    [siteId],
  );
  assert.equal(sites[0].logo_url, signedImage);
});

test("autocomplete uses the current suggestions endpoint", async () => {
  respond = (path, body) => {
    assert.equal(path, "/api/search-bar/fetch-suggestions");
    assert.equal(body.query, "Wise");
    return { body: { value: { experience: "sites", primary: [{ ...site, type: "site" }] } } };
  };
  assert.equal(
    (await client().autocompleteSearch({ query: "Wise", experience: "sites" })).value.primary[0].id,
    siteId,
  );
});

test("HTTP 200 API errors and malformed catalogs cannot masquerade as empty search results", async () => {
  respond = () => ({ body: { error: { message: "unauthenticated" } } });
  await assert.rejects(client().getSearchableSites(), /unauthenticated/);
  respond = () => ({ body: { value: [] } });
  await assert.rejects(client().getSearchableSites(), /Unexpected Mobbin discovery response/);
  respond = () => ({ body: { value: { data: [], hasNextPage: true } } });
  await assert.rejects(client().getSearchableSites(), /empty unfinished page/);
});

test("section retrieval by explicit identity skips catalog, preserves signed crops, and excludes restricted content", async () => {
  respond = (path) => ({
    body: path.endsWith("/sections")
      ? rsc([section, { ...section, id: "locked", restricted: true }])
      : `<a href="/sites/wise-${siteId}/${versionId}/sections">Sections</a>`,
  });
  const sections = await client().getSiteSections({ siteId, siteName: "Wise" });
  assert.deepEqual(
    sections.map((s) => s.id),
    ["allowed-section"],
  );
  assert.equal(sections[0].sectionImageUrl, signedImage);
  assert.equal(sections[0].pageImageUrl, signedImage);
  assert.equal(sections[0].displayOrder, 0);
  assert.match(formatSiteSections(sections), /1 restricted sections omitted/);
  assert.ok(requests.every((r) => r.path.startsWith("/sites/")));
});

test("all-restricted section pages give an explicit access error", async () => {
  respond = (path) => ({
    body: path.endsWith("/sections")
      ? rsc([{ ...section, restricted: true }])
      : `<a href="/sites/wise-${siteId}/${versionId}/sections">Sections</a>`,
  });
  await assert.rejects(
    client().getSiteSections({ siteId, siteName: "Wise" }),
    /restricts all sections/,
  );
});
