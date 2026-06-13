import { getCached, sleep } from './http.ts';
import type { Ecosystem } from '../../enforcement/types.ts';

export interface RegistryInfo {
  license?: string;
  version?: string;
  publishedAt?: string;
  repoUrl?: string;
  homepageUrl?: string;
  registryUrl: string;
  /** Commit SHA the published artifact was built from, when the registry records it. */
  gitHead?: string;
}

function normalizeRepo(url: string | undefined): string | undefined {
  if (!url) return undefined;
  let u = url.replace(/^git\+/, '').replace(/^ssh:\/\/git@/, 'https://').replace(/\.git$/, '');
  if (u.startsWith('git@github.com:')) u = u.replace('git@github.com:', 'https://github.com/');
  return u;
}

async function npm(name: string): Promise<RegistryInfo> {
  const registryUrl = `https://www.npmjs.com/package/${name}`;
  const res = await getCached(`https://registry.npmjs.org/${name.replace('/', '%2F')}`);
  const info: RegistryInfo = { registryUrl };
  if (!res.ok || !res.json) return info;
  const d = res.json as Record<string, any>;
  const latest = d['dist-tags']?.latest as string | undefined;
  const latestVersion = d.versions?.[latest ?? ''];
  info.version = latest;
  info.license = typeof d.license === 'string' ? d.license : latestVersion?.license;
  info.repoUrl = normalizeRepo(d.repository?.url ?? latestVersion?.repository?.url ?? d.repository);
  info.homepageUrl = typeof d.homepage === 'string' ? d.homepage : undefined;
  info.publishedAt = latest ? d.time?.[latest] : d.time?.modified;
  info.gitHead = typeof latestVersion?.gitHead === 'string' ? latestVersion.gitHead : undefined;
  return info;
}

async function crates(name: string): Promise<RegistryInfo> {
  const registryUrl = `https://crates.io/crates/${name}`;
  await sleep(1100); // crates.io: 1 req/sec
  const res = await getCached(`https://crates.io/api/v1/crates/${name}`);
  const info: RegistryInfo = { registryUrl };
  if (!res.ok || !res.json) return info;
  const d = res.json as Record<string, any>;
  const newest = d.versions?.[0];
  info.version = d.crate?.newest_version ?? newest?.num;
  info.license = newest?.license;
  info.publishedAt = newest?.created_at;
  info.repoUrl = normalizeRepo(d.crate?.repository);
  info.homepageUrl = d.crate?.homepage ?? undefined;
  return info;
}

async function pypi(name: string): Promise<RegistryInfo> {
  const registryUrl = `https://pypi.org/project/${name}/`;
  const res = await getCached(`https://pypi.org/pypi/${name}/json`);
  const info: RegistryInfo = { registryUrl };
  if (!res.ok || !res.json) return info;
  const d = res.json as Record<string, any>;
  const i = d.info ?? {};
  info.version = i.version;
  info.license =
    i.license_expression ||
    (typeof i.license === 'string' && i.license.length < 40 ? i.license : undefined) ||
    classifierLicense(i.classifiers);
  const urls = i.project_urls ?? {};
  info.repoUrl = normalizeRepo(urls.Source ?? urls.Repository ?? urls['Source Code'] ?? urls.Homepage ?? i.home_page);
  info.homepageUrl = urls.Homepage ?? i.home_page ?? undefined;
  const rel = d.releases?.[i.version]?.[0];
  info.publishedAt = rel?.upload_time_iso_8601;
  return info;
}

function classifierLicense(classifiers: string[] | undefined): string | undefined {
  const map: Record<string, string> = {
    'License :: OSI Approved :: MIT License': 'MIT',
    'License :: OSI Approved :: Apache Software License': 'Apache-2.0',
    'License :: OSI Approved :: BSD License': 'BSD-3-Clause',
    'License :: OSI Approved :: GNU General Public License v3 (GPLv3)': 'GPL-3.0',
    'License :: OSI Approved :: Mozilla Public License 2.0 (MPL 2.0)': 'MPL-2.0',
  };
  for (const c of classifiers ?? []) if (map[c]) return map[c];
  return undefined;
}

async function hex(name: string): Promise<RegistryInfo> {
  const registryUrl = `https://hex.pm/packages/${name}`;
  const res = await getCached(`https://hex.pm/api/packages/${name}`);
  const info: RegistryInfo = { registryUrl };
  if (!res.ok || !res.json) return info;
  const d = res.json as Record<string, any>;
  info.license = d.meta?.licenses?.[0];
  info.version = d.releases?.[0]?.version;
  info.publishedAt = d.releases?.[0]?.inserted_at ?? d.inserted_at;
  const links = d.meta?.links ?? {};
  info.repoUrl = normalizeRepo(links.GitHub ?? links.Github ?? links.Repository ?? links.Source);
  return info;
}

async function pub(name: string): Promise<RegistryInfo> {
  const registryUrl = `https://pub.dev/packages/${name}`;
  const res = await getCached(`https://pub.dev/api/packages/${name}`);
  const info: RegistryInfo = { registryUrl };
  if (!res.ok || !res.json) return info;
  const d = res.json as Record<string, any>;
  info.version = d.latest?.version;
  info.publishedAt = d.latest?.published;
  const ps = d.latest?.pubspec ?? {};
  info.repoUrl = normalizeRepo(ps.repository ?? ps.homepage);
  info.homepageUrl = ps.homepage;
  return info; // pub.dev has no structured license; resolved via GitHub
}

async function rubygems(name: string): Promise<RegistryInfo> {
  const registryUrl = `https://rubygems.org/gems/${name}`;
  const res = await getCached(`https://rubygems.org/api/v1/gems/${name}.json`);
  const info: RegistryInfo = { registryUrl };
  if (!res.ok || !res.json) return info;
  const d = res.json as Record<string, any>;
  info.version = d.version;
  info.license = d.licenses?.[0];
  info.repoUrl = normalizeRepo(d.source_code_uri ?? d.homepage_uri);
  info.homepageUrl = d.homepage_uri;
  return info;
}

async function golang(modulePath: string): Promise<RegistryInfo> {
  const registryUrl = `https://pkg.go.dev/${modulePath}`;
  const escaped = modulePath.replace(/[A-Z]/g, (c) => `!${c.toLowerCase()}`);
  const res = await getCached(`https://proxy.golang.org/${escaped}/@latest`);
  const info: RegistryInfo = { registryUrl };
  if (res.ok && res.json) {
    const d = res.json as Record<string, any>;
    info.version = d.Version;
    info.publishedAt = d.Time;
  }
  if (modulePath.startsWith('github.com/')) info.repoUrl = `https://${modulePath}`;
  return info; // license resolved via GitHub
}

export function fetchRegistry(name: string, ecosystem: Ecosystem): Promise<RegistryInfo> {
  switch (ecosystem) {
    case 'js':
      return npm(name);
    case 'rust':
      return crates(name);
    case 'py':
      return pypi(name);
    case 'elixir':
      return hex(name);
    case 'dart':
      return pub(name);
    case 'ruby':
      return rubygems(name);
    case 'go':
      return golang(name);
    default:
      return Promise.resolve({ registryUrl: '' });
  }
}
