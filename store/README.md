# Store listings

The texts for the Chrome Web Store, Opera add-ons and Firefox Add-ons (AMO), ready to
paste into each store's form. None of this is in the package (`tools/build.mjs`
excludes `store/`).

- `listing.md`: the name, the short and long descriptions in English and Norwegian
  (Bokmål), the category and the links.
- `review.md`: what the stores ask for besides the description: the single purpose,
  each permission's reason, the data-use answers, and notes for the reviewers.
- The privacy policy is `PRIVACY.md` at the root, linked by its GitHub address:
  https://github.com/Dude4Linux/arkivet2fs/blob/master/PRIVACY.md

All three stores take the same zip, `arkivet2fs-X.Y.Z-chromium.zip` from the GitHub
release, after `tools/release`. Each store signs its own copy and updates it; the
update check stays off there, since it runs only in a copy loaded unpacked.

When a release changes what the extension reads, keeps or sends, update `PRIVACY.md`,
`SECURITY.md`'s "What the extension does with your data", `review.md`, and each
store's data form. When it adds a permission, add its reason to `review.md`.
