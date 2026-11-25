// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Maven pom.xml (Layer 1). Before this reader, Layer 1 had no Maven support at
 * all even though excluded-organizations.yaml lists `maven_groups`.
 *
 * Coordinate locations, per the Apache Maven POM Reference
 * (https://maven.apache.org/pom.html), model descriptor
 * (https://maven.apache.org/ref/current/maven-model/maven.html) and plugin guide
 * (https://maven.apache.org/guides/mini/guide-configuring-plugins.html):
 *  - read:  <parent>; <dependency> under <dependencies> (project, profile,
 *           <dependencyManagement>, and inside a <plugin>); <plugin> under
 *           <plugins> (build, pluginManagement, reporting, profiles), whose
 *           groupId defaults to org.apache.maven.plugins; <extension> under
 *           build <extensions>.
 *  - skip:  <exclusions> (artifacts Maven must NOT include) and <relocation>
 *           (a moved-artifact notice), which name coordinates the build does not use.
 *  - `${x}` resolves from <properties> and from `project.*` dot-paths on this
 *    POM; groupId is inherited from <parent> when the project omits it. A
 *    coordinate that still holds `${...}` (env., settings., inherited
 *    properties) is a named warning, like Gradle version catalogs.
 *
 * Fail closed: input that is not well-formed XML with a <project> root throws
 * InputFailure('unparseable_manifest'). The tiny XML reader below supports what
 * POMs use (elements, text, comments, CDATA, processing instructions, the five
 * predefined entities and numeric references) and rejects anything else.
 */
import { InputFailure } from '../../input-errors.ts';
import type { DependencyRef } from '../../types.ts';
import type { ManifestParseResult } from './js.ts';

interface XmlEl {
  name: string;
  children: XmlEl[];
  text: string;
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decodeText(raw: string, file: string): string {
  return raw.replace(/&([^;\s&<]*);?/g, (whole, ref: string) => {
    if (!whole.endsWith(';')) throw new InputFailure('unparseable_manifest', file, `bare "&" in text near "${whole}"`);
    if (ref in ENTITIES) return ENTITIES[ref]!;
    const num = /^#x([0-9a-f]+)$/i.exec(ref) ?? /^#([0-9]+)$/.exec(ref);
    if (num) return String.fromCodePoint(parseInt(num[1]!, ref.startsWith('#x') || ref.startsWith('#X') ? 16 : 10));
    throw new InputFailure('unparseable_manifest', file, `unknown XML entity "&${ref};"`);
  });
}

/** Parse well-formed XML into a minimal element tree; anything else throws. */
function parseXml(src: string, file: string): XmlEl {
  const fail = (detail: string): never => {
    throw new InputFailure('unparseable_manifest', file, `not well-formed XML: ${detail}`);
  };
  const text = src.replace(/^﻿/, '');
  const stack: XmlEl[] = [];
  let root: XmlEl | undefined;
  let i = 0;
  const appendText = (t: string) => {
    if (stack.length > 0) stack[stack.length - 1]!.text += t;
    else if (t.trim()) fail('text outside the root element');
  };

  while (i < text.length) {
    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      if (end === -1) fail('unterminated comment');
      i = end + 3;
    } else if (text.startsWith('<![CDATA[', i)) {
      const end = text.indexOf(']]>', i + 9);
      if (end === -1) fail('unterminated CDATA section');
      if (stack.length === 0) fail('CDATA outside the root element');
      appendText(text.slice(i + 9, end));
      i = end + 3;
    } else if (text.startsWith('<?', i)) {
      const end = text.indexOf('?>', i + 2);
      if (end === -1) fail('unterminated processing instruction');
      i = end + 2;
    } else if (text.startsWith('<!', i)) {
      const end = text.indexOf('>', i + 2);
      if (end === -1) fail('unterminated declaration');
      if (text.slice(i, end).includes('[')) fail('DOCTYPE internal subsets are not supported');
      i = end + 1;
    } else if (text.startsWith('</', i)) {
      const end = text.indexOf('>', i + 2);
      if (end === -1) fail('unterminated closing tag');
      const name = text.slice(i + 2, end).trim();
      const open = stack.pop();
      if (!open) fail(`closing tag </${name}> without an opening tag`);
      if (open!.name !== localName(name)) fail(`</${name}> closes <${open!.name}>`);
      if (stack.length === 0) root = open;
      i = end + 1;
    } else if (text[i] === '<') {
      // Find the tag end, skipping quoted attribute values.
      let j = i + 1;
      let quote: string | undefined;
      for (; j < text.length; j += 1) {
        const ch = text[j]!;
        if (quote) {
          if (ch === quote) quote = undefined;
        } else if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '>') break;
      }
      if (j >= text.length) fail('unterminated tag');
      const body = text.slice(i + 1, j);
      const selfClosing = body.endsWith('/');
      const name = /^([A-Za-z_][\w.:-]*)/.exec(body)?.[1];
      if (!name) fail(`invalid tag "<${body.slice(0, 20)}>"`);
      if (root) fail('more than one root element');
      const el: XmlEl = { name: localName(name!), children: [], text: '' };
      if (stack.length > 0) stack[stack.length - 1]!.children.push(el);
      if (selfClosing) {
        if (stack.length === 0) root = el;
      } else stack.push(el);
      i = j + 1;
    } else {
      const next = text.indexOf('<', i);
      const end = next === -1 ? text.length : next;
      appendText(decodeText(text.slice(i, end), file));
      i = end;
    }
  }
  if (stack.length > 0) fail(`<${stack[stack.length - 1]!.name}> is never closed`);
  if (!root) fail('no root element');
  return root!;
}

function localName(qname: string): string {
  const colon = qname.indexOf(':');
  return colon === -1 ? qname : qname.slice(colon + 1);
}

function child(el: XmlEl | undefined, name: string): XmlEl | undefined {
  return el?.children.find((c) => c.name === name);
}

function childText(el: XmlEl | undefined, name: string): string | undefined {
  const t = child(el, name)?.text.trim();
  return t ? t : undefined;
}

export function parsePomXml(content: string, file: string): ManifestParseResult {
  const deps: DependencyRef[] = [];
  const warnings: string[] = [];

  const project = parseXml(content, file);
  if (project.name !== 'project') {
    throw new InputFailure('unparseable_manifest', file, `root element is <${project.name}>, not <project>`);
  }

  const parent = child(project, 'parent');
  const props = new Map<string, string>();
  for (const p of child(project, 'properties')?.children ?? []) props.set(p.name, p.text.trim());

  /** `project.a.b` -> text of <project><a><b>, with groupId/version inherited from <parent>. */
  const projectPath = (path: string): string | undefined => {
    const parts = path.split('.');
    let el: XmlEl | undefined = project;
    for (const part of parts) el = child(el, part);
    const own = el?.text.trim();
    if (own) return own;
    if (parts.length === 1 && (parts[0] === 'groupId' || parts[0] === 'version')) return childText(parent, parts[0]);
    return undefined;
  };

  const resolve = (value: string | undefined, depth = 0): string | undefined => {
    if (value === undefined || depth > 8) return value;
    const out = value.replace(/\$\{([^}]+)\}/g, (whole, key: string) => {
      const v = key.startsWith('project.') ? projectPath(key.slice('project.'.length)) : props.get(key);
      return v === undefined ? whole : v;
    });
    return out !== value && out.includes('${') ? resolve(out, depth + 1) : out;
  };

  const add = (el: XmlEl, depType: string, defaultGroup?: string, interpolate = true) => {
    const rawGroup = childText(el, 'groupId') ?? defaultGroup;
    const rawArtifact = childText(el, 'artifactId');
    const group = interpolate ? resolve(rawGroup) : rawGroup;
    const artifact = interpolate ? resolve(rawArtifact) : rawArtifact;
    const version = interpolate ? resolve(childText(el, 'version')) : childText(el, 'version');
    const label = `${rawGroup ?? '?'}:${rawArtifact ?? '?'}`;
    if (!group || !artifact || group.includes('${') || artifact.includes('${')) {
      warnings.push(
        `${file}: ${depType} ${label} has a coordinate that cannot be resolved statically (unparseable_dependency_block)`,
      );
      return;
    }
    deps.push({ name: `${group}:${artifact}`, version, ecosystem: 'kotlin', scope: group, source_file: file, dep_type: depType });
  };

  // <parent> children are literal values (the model says they are not interpolated).
  if (parent) add(parent, 'parent', undefined, false);

  const walk = (el: XmlEl, ancestors: string[]): void => {
    for (const c of el.children) {
      if (c.name === 'exclusions' || c.name === 'relocation') continue; // named, but not used by the build
      if (c.name === 'dependency' && el.name === 'dependencies') {
        const kind = ancestors.includes('plugin')
          ? 'plugin-dependency'
          : ancestors.includes('dependencyManagement')
            ? 'managed-dependency'
            : 'dependency';
        add(c, kind);
      } else if (c.name === 'plugin' && el.name === 'plugins') {
        add(c, 'plugin', 'org.apache.maven.plugins');
      } else if (c.name === 'extension' && el.name === 'extensions') {
        add(c, 'extension');
      }
      walk(c, [...ancestors, c.name]);
    }
  };
  walk(project, ['project']);

  return { deps, warnings };
}
