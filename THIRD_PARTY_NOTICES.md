# THIRD_PARTY_NOTICES

This product bundles third-party software components.

The notices below cover the runtime components currently packaged in the Windows installer via `src-tauri/tauri.windows.conf.json`.

## 1) Eclipse Temurin JDK (Windows x64)

- Component: Eclipse Temurin JDK
- Vendor: Eclipse Adoptium
- Bundled location: `resources/jdk/win-x64`
- Version (bundled): `25.0.1+8-LTS` (`JAVA_RUNTIME_VERSION`), `25.0.1` (`JAVA_VERSION`)
- Implementor version: `Temurin-25.0.1+8`

### License

- SPDX: `GPL-2.0 WITH Classpath-exception-2.0`
- See bundled notices:
  - `resources/jdk/win-x64/NOTICE`
  - `resources/jdk/win-x64/legal/` (module-level third-party and license attributions)

### Source Code

Source repositories identified in the bundled release metadata:

- https://github.com/adoptium/jdk25u.git
- https://github.com/adoptium/temurin-build.git

Additional project information:

- https://projects.eclipse.org/projects/adoptium.temurin
- https://adoptium.net/

## 2) Eclipse JDT Language Server (JDT LS)

- Component: Eclipse JDT Language Server distribution
- Bundled location: `resources/jdtls`
- Included core bundle example: `resources/jdtls/plugins/org.eclipse.jdt.ls.core_1.56.0.202601291528.jar`

### License

- Primary project license: Eclipse Public License 2.0 (EPL-2.0)
- Project page: https://projects.eclipse.org/projects/eclipse.jdt.ls
- EPL-2.0 text: https://www.eclipse.org/org/documents/epl-2.0/EPL-2.0.txt

### Additional Bundle Notices

The JDT LS distribution includes many Eclipse/third-party OSGi bundles under `resources/jdtls/plugins/`.
Those bundles may contain their own notices and license files (for example `about.html`, `about_files/NOTICE`, `META-INF/LICENSE`) and should be treated as applicable to each bundle.

## Notes

- This `THIRD_PARTY_NOTICES.md` provides attribution and reference locations for bundled third-party components.
- Your project license applies to your own source code; bundled third-party components remain under their respective licenses.
