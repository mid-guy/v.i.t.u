# Security Policy

## Supported versions

Security fixes are released for the latest version published on npm.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through GitHub:
[Report a vulnerability](https://github.com/mid-guy/v.i.t.u/security/advisories/new).

Include the affected version, a description of the problem, and a minimal
input that reproduces it. You can expect an acknowledgement within a week. Once
a fix is released, the advisory is published and you are credited unless you
ask not to be.

## Scope

This package is a build-time Babel plugin: it transforms your own source code
and has no runtime dependencies. Relevant reports include input that makes the
plugin generate code with different behaviour from what the documentation
describes in a way that could be exploited, or problems in the release and
publishing pipeline.
