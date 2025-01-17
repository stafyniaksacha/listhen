import { networkInterfaces } from "node:os";
import { relative } from "pathe";
import { colors } from "consola/utils";
import { consola } from "consola";
import { ListenOptions } from "./types";
import { isWsl } from "./lib/wsl";

export function getNetworkInterfaces(includeIPV6?: boolean): string[] {
  const addrs = new Set<string>();
  for (const details of Object.values(networkInterfaces())) {
    if (details) {
      for (const d of details) {
        if (
          !d.internal &&
          !(d.mac === "00:00:00:00:00:00") &&
          !d.address.startsWith("fe80::") &&
          !(!includeIPV6 && (d.family === "IPv6" || +d.family === 6))
        ) {
          addrs.add(formatAddress(d));
        }
      }
    }
  }
  return [...addrs].sort();
}

export function formatAddress(addr: {
  family: string | number;
  address: string;
}) {
  return addr.family === "IPv6" || addr.family === 6
    ? `[${addr.address}]`
    : addr.address;
}

export function formatURL(url: string) {
  return colors.cyan(
    colors.underline(
      decodeURI(url).replace(/:(\d+)\//g, `:${colors.bold("$1")}/`),
    ),
  );
}

const _localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
export function isLocalhost(hostname: string | undefined) {
  return hostname === undefined ? false : _localHosts.has(hostname);
}

const _anyHosts = new Set(["", "0.0.0.0", "::"]);
export function isAnyhost(hostname: string | undefined) {
  return hostname === undefined ? false : _anyHosts.has(hostname);
}

export function generateURL(
  hostname: string,
  listhenOptions: ListenOptions,
  baseURL?: string,
) {
  const proto = listhenOptions.https ? "https://" : "http://";
  let port = listhenOptions.port || "";
  if (
    (port === 80 && proto === "http://") ||
    (port === 443 && proto === "https://")
  ) {
    port = "";
  }
  if (hostname[0] !== "[" && hostname.includes(":")) {
    hostname = `[${hostname}]`;
  }
  return (
    proto + hostname + ":" + port + (baseURL || listhenOptions.baseURL || "")
  );
}

export function getDefaultHost(preferPublic?: boolean) {
  // Prefer IPV4 stack for Windows and WSL to avoid performance issues
  if (process.platform === "win32" || isWsl()) {
    return preferPublic ? "0.0.0.0" : "127.0.0.1";
  }
  // For local, use "localhost" to be developer friendly and allow loopback customization}
  // For public, use "" to listen on all NIC interfaces (IPV4 and IPV6)
  return preferPublic ? "" : "localhost";
}

export function getPublicURL(
  listhenOptions: ListenOptions,
  baseURL?: string,
): string | undefined {
  if (listhenOptions.publicURL) {
    return listhenOptions.publicURL;
  }

  const stackblitzURL = detectStackblitzURL(listhenOptions._entry);
  if (stackblitzURL) {
    return stackblitzURL;
  }

  if (
    listhenOptions.hostname &&
    !isLocalhost(listhenOptions.hostname) &&
    !isAnyhost(listhenOptions.hostname)
  ) {
    return generateURL(listhenOptions.hostname, listhenOptions, baseURL);
  }
}

function detectStackblitzURL(entry?: string) {
  try {
    if (process.env.SHELL !== "/bin/jsh") {
      return;
    }

    const cwd = process.env.PWD || ("" as string);

    // Editor
    if (cwd.startsWith("/home/projects")) {
      const projectId = cwd.split("/")[3];
      const relativeEntry =
        entry && relative(process.cwd(), entry).replace(/^\.\//, "");
      const query = relativeEntry ? `?file=${relativeEntry}` : "";
      return `https://stackblitz.com/edit/${projectId}${query}`;
    }

    // Codeflow
    if (cwd.startsWith("/home")) {
      const githubRepo = cwd.split("/").slice(2).join("/");
      return `https://stackblitz.com/edit/~/github.com/${githubRepo}`;
    }
  } catch (error) {
    console.error(error);
  }
}

const HOSTNAME_RE = /^(?!-)[\d.:A-Za-z-]{1,63}(?<!-)$/;

export function validateHostname(hostname: string, _public: boolean) {
  if (hostname && !HOSTNAME_RE.test(hostname)) {
    const fallbackHost = _public ? "0.0.0.0" : "127.0.0.1";
    consola.warn(
      `[listhen] Invalid hostname \`${hostname}\`. Using \`${fallbackHost}\` as fallback.`,
    );
    return fallbackHost;
  }
  return hostname;
}
