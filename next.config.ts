import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";
import { parse } from "yaml";

// куда идёт каждый /api/* — решает x-status в спеке: live -> бэк, mock -> Prism
const BACKEND = process.env.API_PROXY_TARGET ?? "http://localhost:8000";
const MOCK = process.env.API_MOCK_TARGET ?? "http://localhost:4010";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;

type Operation = { "x-status"?: "live" | "mock" };
type Spec = { paths?: Record<string, Partial<Record<(typeof HTTP_METHODS)[number], Operation>>> };

function apiRewrites(): { source: string; destination: string }[] {
  let spec: Spec;
  try {
    spec = parse(readFileSync(join(process.cwd(), "openapi.yaml"), "utf8"));
  } catch {
    // спеки нет — всё на бэк
    return [{ source: "/api/:path*", destination: `${BACKEND}/api/:path*` }];
  }

  const rewrites: { source: string; destination: string }[] = [];
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    const ops = HTTP_METHODS.map((m) => item[m]).filter((op) => op !== undefined);
    // rewrites не различают методы: в мок только если все операции пути mock
    const allMock = ops.length > 0 && ops.every((op) => op["x-status"] === "mock");
    const source = path.replace(/\{(\w+)\}/g, ":$1");
    rewrites.push({
      source,
      destination: `${allMock ? MOCK : BACKEND}${source}`,
    });
  }
  // остальное на бэк; первое совпадение выигрывает
  rewrites.push({ source: "/api/:path*", destination: `${BACKEND}/api/:path*` });
  return rewrites;
}

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async rewrites() {
    return apiRewrites();
  },
};

export default nextConfig;
