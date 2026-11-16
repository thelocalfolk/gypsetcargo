<!-- Brain link: client/venture context lives in the Brain (Google Drive). Global rules: ~/.claude/CLAUDE.md -->
@~/Brain/01_The-Local-Folk/Agency/Clients/Gypset-Cargo/CLAUDE.md

# gypset-cargo-theme — repo notes

Atelier 1.0.2 theme, connected to Shopify through the GitHub integration (`main` is synced by shopify[bot]).

- Never push to `main` directly: it may be the branch of a connected theme. Work on a branch, connect it in Shopify as a new unpublished theme to preview, merge when approved.
- Custom code is prefixed `gc-`: snippets/gc-*.liquid, rendered from Custom Liquid blocks in the JSON templates so it survives theme-editor edits.
- Pre-order logic: Custom Liquid block in templates/product.json, driven by the `preorder` product tag.
