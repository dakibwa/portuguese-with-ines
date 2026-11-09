import { problem } from "./security.mjs";

function hostname(value, base) {
  const host = String(value ?? "")
    .trim()
    .toLowerCase();
  if (
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ||
    host === base ||
    host.endsWith(`.${base}`) ||
    /\.(?:localhost|local|invalid|test)$/.test(host)
  )
    throw problem("Enter your own domain name, without https:// or a path.");
  return host;
}
async function cloudflare(env, path, input) {
  if (
    !env.VOWEL_CLOUDFLARE_TOKEN ||
    !env.VOWEL_ZONE_ID ||
    !env.VOWEL_CUSTOM_DOMAIN_TARGET
  )
    throw problem(
      "Custom domains aren't configured yet. Your free address keeps working.",
      503,
    );
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(env.VOWEL_ZONE_ID)}/custom_hostnames${path}`,
    {
      method: input ? "POST" : "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${env.VOWEL_CLOUDFLARE_TOKEN}`,
        "Content-Type": "application/json",
      },
      ...(input ? { body: JSON.stringify(input) } : {}),
    },
  );
  const data = await response.json();
  if (!response.ok || !data.success)
    throw problem(
      "The domain couldn't be connected just now. Check the address and try again.",
      503,
    );
  return data.result;
}
function recordResult(directory, siteId, result) {
  const active = result.status === "active" && result.ssl?.status === "active";
  const verification = {
    cname: directory.env.VOWEL_CUSTOM_DOMAIN_TARGET,
    ownership: result.ownership_verification || null,
    ssl: result.ssl?.validation_records || [],
    sslStatus: result.ssl?.status || "pending",
  };
  directory.rows(
    "UPDATE domains SET provider_id=?,status=?,verification=? WHERE host=? AND site_id=?",
    result.id,
    active ? "active" : "pending",
    JSON.stringify(verification),
    result.hostname,
    siteId,
  );
  return {
    host: result.hostname,
    status: active ? "active" : "pending",
    verification,
  };
}
export async function connectDomain(directory, site, value) {
  const host = hostname(
    value,
    directory.env.VOWEL_BASE_DOMAIN || "vowel.invalid",
  );
  const existing = directory.one("SELECT * FROM domains WHERE host=?", host);
  if (existing && existing.site_id !== site.id)
    throw problem("That domain is already connected to another site.", 409);
  if (existing?.provider_id) return refreshDomain(directory, site, host);
  if (
    directory.rows("SELECT host FROM domains WHERE site_id=?", site.id)
      .length >= 3 &&
    !existing
  )
    throw problem("You already have three domain names on this site.", 409);
  // Reserve before the first await: another owner cannot claim the same host
  // while Cloudflare is checking it. A failed request remains retryable.
  directory.rows(
    "INSERT OR IGNORE INTO domains(host,site_id) VALUES(?,?)",
    host,
    site.id,
  );
  const result = await cloudflare(directory.env, "", {
    hostname: host,
    ssl: { method: "txt", type: "dv", settings: { min_tls_version: "1.2" } },
  });
  return recordResult(directory, site.id, result);
}
export async function refreshDomain(directory, site, value) {
  const host = hostname(
    value,
    directory.env.VOWEL_BASE_DOMAIN || "vowel.invalid",
  );
  const row = directory.one(
    "SELECT * FROM domains WHERE host=? AND site_id=?",
    host,
    site.id,
  );
  if (!row?.provider_id) throw problem("Add that domain first.", 404);
  return recordResult(
    directory,
    site.id,
    await cloudflare(directory.env, `/${encodeURIComponent(row.provider_id)}`),
  );
}
