import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions, Log, LogLevel } from "miniflare";
import { unstable_getMiniflareWorkerOptions } from "wrangler";
import { digest, randomToken } from "../workers/vowel/security.mjs";

// Real workerd + SQLite. Test identities and the optional local browser entry
// are compiled here only; the production Worker has no fixture auth endpoint.
const serve = process.argv.includes("--serve");
const root = fileURLToPath(new URL("../", import.meta.url));
const scratch = await mkdtemp(path.join(tmpdir(), "vowel-runtime-"));
const fixtureCookie = randomToken();
const source = `import worker from ${JSON.stringify(path.join(root, "workers/vowel/worker.mjs"))};
export {TutorDirectory,TutorStore} from ${JSON.stringify(path.join(root, "workers/vowel/worker.mjs"))};
export default {fetch(request,env,ctx){
if(env.FIXTURE_BROWSER === '1' && new URL(request.url).pathname === '/__fixture/teacher')
return new Response(null,{status:302,headers:{Location:'/dashboard/', 'Set-Cookie':'vowel_session='+env.FIXTURE_COOKIE+'; HttpOnly; SameSite=Lax; Path=/'}});
return worker.fetch(request,env,ctx);}};`;
await build({
  stdin: {
    contents: source,
    resolveDir: root,
    sourcefile: "runtime-fixture.mjs",
  },
  outfile: path.join(scratch, "worker.mjs"),
  bundle: true,
  format: "esm",
  platform: "neutral",
  conditions: ["workerd", "browser"],
  target: "es2022",
  external: ["cloudflare:workers", "node:*"],
  loader: { ".sql": "text" },
});
const { workerOptions } = await unstable_getMiniflareWorkerOptions(
  path.join(root, "workers/vowel/wrangler.jsonc"),
);
const mf = new Miniflare(
  convertV4MiniflareOptions({
    ...workerOptions,
    modulesRules: undefined,
    name: "vowel",
    rootPath: root,
    modules: true,
    modulesRoot: scratch,
    scriptPath: path.join(scratch, "worker.mjs"),
    port: serve ? 8789 : 0,
    host: "127.0.0.1",
    unsafeInspectDurableObjects: true,
    log: new Log(LogLevel.ERROR),
    bindings: {
      ...workerOptions.bindings,
      VOWEL_AUTH_SECRET: randomToken(),
      FIXTURE_BROWSER: serve ? "1" : "0",
      FIXTURE_COOKIE: fixtureCookie,
    },
    outboundService: () =>
      new Response("External providers are disabled in this fixture.", {
        status: 503,
      }),
  }),
);
try {
  const address = await mf.ready,
    origin = address.origin;
  const call = async (
    pathname,
    input,
    {
      cookie = fixtureCookie,
      token = "",
      method = input === undefined ? "GET" : "POST",
    } = {},
  ) => {
    const response = await mf.dispatchFetch(origin + pathname, {
      method,
      headers: {
        Origin: origin,
        ...(cookie ? { Cookie: `vowel_session=${cookie}` } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(input === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    });
    const data = await response.json();
    assert.ok(
      response.ok,
      `${method} ${pathname}: ${response.status} ${data.error || ""}`,
    );
    return data;
  };
  const bindings = await mf.getBindings("vowel");
  await bindings.TUTOR_DIRECTORY.getByName("directory").getSite("fixture");
  const directory = await mf.unsafeGetDurableObjectStorage(
    "vowel",
    "TutorDirectory",
    { name: "directory" },
  );
  const owner = crypto.randomUUID(),
    other = crypto.randomUUID(),
    otherCookie = randomToken();
  await directory.exec(
    "INSERT INTO users(id,email,name,created_at) VALUES(?,?,?,?)",
    owner,
    "alex@example.invalid",
    "Alex",
    Date.now(),
  );
  await directory.exec(
    "INSERT INTO users(id,email,name,created_at) VALUES(?,?,?,?)",
    other,
    "sam@example.invalid",
    "Sam",
    Date.now(),
  );
  for (const [cookie, user] of [
    [fixtureCookie, owner],
    [otherCookie, other],
  ])
    await directory.exec(
      "INSERT INTO sessions VALUES(?,?,?)",
      await digest(cookie),
      user,
      Date.now() + 86400000,
    );
  let { site } = await call("/api/platform/sites", {});
  ({ site } = await call(
    `/api/platform/sites/${site.id}`,
    {
      version: site.version,
      name: "Alex Morgan",
      shortName: "Alex",
      brand: "English with Alex",
      language: { name: "English", variety: "English", code: "en" },
      place: {
        city: "London",
        country: "GB",
        currency: "GBP",
        timeZone: "Europe/London",
      },
      content: {
        hero: {
          title: "Find your voice in English.",
          line: "Thoughtful lessons, built around you.",
        },
        about: {
          heading: "Hello, I'm Alex.",
          body: "I teach English with space for questions, practice and the things you want to say. We will find a pace and a plan that work for you.",
        },
        reviewed: true,
      },
      hours: Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        startMinute: 540,
        endMinute: 1020,
      })),
    },
    { method: "PATCH" },
  ));
  const foreign = await mf.dispatchFetch(
    `${origin}/api/platform/sites/${site.id}`,
    { headers: { Cookie: `vowel_session=${otherCookie}` } },
  );
  assert.equal(foreign.status, 404);
  ({ site } = await call(`/api/platform/sites/${site.id}/publish`, {
    version: site.version,
  }));
  const publicPage = await mf.dispatchFetch(`${origin}/t/${site.id}/`);
  assert.equal(publicPage.status, 200);
  assert.match(await publicPage.text(), /Find your voice in English/);
  const { token } = await call(
    `/api/platform/sites/${site.id}/teacher-session`,
    {},
  );
  const { student } = await call(
    `/api/tutor/${site.id}/admin/students`,
    { name: "Jamie", email: "jamie@example.invalid", prices: {} },
    { token },
  );
  assert.ok(student.id);
  const types = await call(`/api/tutor/${site.id}/lesson-types`);
  assert.equal(types.lessonTypes.length, 3);
  assert.equal(types.lessonTypes[0].first_lesson_only, 1);
  const { site: otherSite } = await call(
    "/api/platform/sites",
    {},
    { cookie: otherCookie },
  );
  const cross = await mf.dispatchFetch(
    `${origin}/api/tutor/${otherSite.id}/admin/students`,
    {
      headers: {
        Cookie: `vowel_session=${otherCookie}`,
        Authorization: `Bearer ${token}`,
      },
    },
  );
  assert.equal(cross.status, 401);
  const health = await call("/health");
  assert.equal(health.signups, false);
  console.log(
    "Vowel workerd integration passed: SQLite storage, owner access, publication, teaching sessions and tutor isolation.",
  );
  if (serve) {
    console.log(
      `Local fixture ready: ${origin}/__fixture/teacher (fictional tutor; no email, AI or payments).`,
    );
    await new Promise((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
  }
} finally {
  await mf.dispose();
  await rm(scratch, { recursive: true, force: true });
}
