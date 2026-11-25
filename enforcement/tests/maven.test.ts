// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Maven pom.xml reader (Layer 1). Coordinate locations follow the Apache Maven
// POM Reference (https://maven.apache.org/pom.html), the model descriptor
// (https://maven.apache.org/ref/current/maven-model/maven.html) and the plugin
// guide (https://maven.apache.org/guides/mini/guide-configuring-plugins.html):
//   used:      dependencies, dependencyManagement, plugin dependencies, build and
//              reporting plugins (default group org.apache.maven.plugins),
//              build extensions, parent, and all of these inside profiles
//   not used:  <exclusions> (artifacts removed) and <relocation> (move notice)
// Detection runs against a made-up TEST vendor group so no real excluded
// coordinate is written into the repo (project guard).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InputFailure } from '../input-errors.ts';
import { matchDependency } from '../matcher.ts';
import { parsePomXml } from '../layer1-direct/parsers/maven.ts';
import { runLayer1OnTree } from '../layer1-direct/index.ts';
import type { ExcludedOrg } from '../types.ts';

const TEST_VENDOR: ExcludedOrg = {
  key: 'test-vendor',
  display_name: 'Test Vendor (fixture only)',
  llm_provider: false,
  github_orgs: [],
  npm_scopes: [],
  npm_packages: [],
  pypi_maintainers: [],
  pypi_packages: [],
  crates_publishers: [],
  crates_packages: [],
  hex_publishers: [],
  hex_packages: [],
  rubygems_authors: [],
  rubygems_packages: [],
  maven_groups: ['org.bannedvendor'],
  pub_publishers: [],
  pub_packages: [],
  go_module_prefixes: [],
};
const orgs = [TEST_VENDOR];

const POM = `<?xml version="1.0" encoding="UTF-8"?>
<!-- <dependency><groupId>org.bannedvendor</groupId><artifactId>commented-out</artifactId></dependency> -->
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.example.parent</groupId>
    <artifactId>parent-pom</artifactId>
    <version>1.0.0</version>
  </parent>
  <artifactId>app</artifactId>
  <properties>
    <vendor.group>org.bannedvendor</vendor.group>
    <jackson.version>2.17.0</jackson.version>
  </properties>
  <dependencyManagement>
    <dependencies>
      <dependency>
        <groupId>org.example.bom</groupId>
        <artifactId>platform-bom</artifactId>
        <version>3.0.0</version>
        <type>pom</type>
        <scope>import</scope>
      </dependency>
    </dependencies>
  </dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>com.fasterxml.jackson.core</groupId>
      <artifactId>jackson-databind</artifactId>
      <version>\${jackson.version}</version>
      <exclusions>
        <exclusion>
          <groupId>org.bannedvendor</groupId>
          <artifactId>excluded-not-used</artifactId>
        </exclusion>
      </exclusions>
    </dependency>
    <dependency>
      <groupId>\${project.groupId}</groupId>
      <artifactId>sibling-module</artifactId>
    </dependency>
  </dependencies>
  <build>
    <extensions>
      <extension>
        <groupId>org.example.ext</groupId>
        <artifactId>build-ext</artifactId>
      </extension>
    </extensions>
    <plugins>
      <plugin>
        <artifactId>maven-compiler-plugin</artifactId>
        <extensions>true</extensions>
        <dependencies>
          <dependency>
            <groupId>org.example.plugdep</groupId>
            <artifactId>plugin-helper</artifactId>
          </dependency>
        </dependencies>
      </plugin>
    </plugins>
  </build>
  <profiles>
    <profile>
      <id>vendor</id>
      <dependencies>
        <dependency>
          <groupId>\${vendor.group}</groupId>
          <artifactId>vendor-sdk</artifactId>
          <version><![CDATA[2.0.0]]></version>
        </dependency>
      </dependencies>
    </profile>
  </profiles>
  <distributionManagement>
    <relocation>
      <groupId>org.bannedvendor</groupId>
      <artifactId>moved-notice-only</artifactId>
    </relocation>
  </distributionManagement>
</project>
`;

test('pom.xml: every used coordinate is read, with its role', () => {
  const { deps, warnings } = parsePomXml(POM, 'pom.xml');
  assert.deepEqual(
    deps.map((d) => `${d.dep_type} ${d.name}`).sort(),
    [
      'dependency com.fasterxml.jackson.core:jackson-databind',
      'dependency org.bannedvendor:vendor-sdk',
      'dependency org.example.parent:sibling-module',
      'extension org.example.ext:build-ext',
      'managed-dependency org.example.bom:platform-bom',
      'parent org.example.parent:parent-pom',
      'plugin org.apache.maven.plugins:maven-compiler-plugin',
      'plugin-dependency org.example.plugdep:plugin-helper',
    ],
  );
  assert.deepEqual(warnings, []);
  const jackson = deps.find((d) => d.name.endsWith(':jackson-databind'));
  assert.equal(jackson?.version, '2.17.0'); // ${jackson.version} resolved from <properties>
  assert.equal(deps.find((d) => d.name.endsWith(':vendor-sdk'))?.version, '2.0.0'); // CDATA text
});

test('pom.xml: a test-vendor dependency in a profile is flagged; exclusions, relocations and comments are not', () => {
  const flagged = parsePomXml(POM, 'pom.xml').deps.filter((d) => matchDependency(d, orgs).length > 0);
  assert.deepEqual(flagged.map((d) => d.name), ['org.bannedvendor:vendor-sdk']);
});

test('pom.xml: an unresolvable ${...} coordinate is a named warning, never a silent pass', () => {
  const pom = POM.replace('<groupId>${vendor.group}</groupId>', '<groupId>${env.VENDOR_GROUP}</groupId>');
  const { deps, warnings } = parsePomXml(pom, 'pom.xml');
  assert.ok(!deps.some((d) => d.name.endsWith(':vendor-sdk')));
  assert.ok(warnings.some((w) => w.includes('vendor-sdk') && w.includes('unparseable_dependency_block')), warnings.join('\n'));
});

test('pom.xml that is not well-formed XML, or not a <project>, fails closed (unparseable_manifest)', () => {
  const broken: Array<[string, string]> = [
    ['unclosed element', '<project><dependencies><dependency></dependencies></project>'],
    ['mismatched close', '<project><dependencies></dependency></project>'],
    ['unterminated comment', '<project><!-- never closed </project>'],
    ['unknown entity', '<project><artifactId>a&bogus;</artifactId></project>'],
    ['root is not <project>', '<settings><servers/></settings>'],
    ['text after the root', '<project></project><project></project>'],
  ];
  for (const [label, content] of broken) {
    assert.throws(
      () => parsePomXml(content, 'pom.xml'),
      (e: unknown) => e instanceof InputFailure && e.reason === 'unparseable_manifest',
      label,
    );
  }
});

test('Layer 1 tree scan reads pom.xml: a flagged coordinate blocks; a broken pom blocks with a named error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'enf-maven-'));
  try {
    writeFileSync(join(dir, 'pom.xml'), POM);
    const dirty = runLayer1OnTree(dir, orgs);
    assert.equal(dirty.status, 'block');
    assert.equal(dirty.scanned, 1);
    assert.ok(dirty.findings.some((f) => f.dependency === 'org.bannedvendor:vendor-sdk'));

    writeFileSync(join(dir, 'pom.xml'), '<project><dependencies></project>');
    const broken = runLayer1OnTree(dir, orgs);
    assert.equal(broken.status, 'block');
    assert.equal(broken.errors?.[0]?.reason, 'unparseable_manifest');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
