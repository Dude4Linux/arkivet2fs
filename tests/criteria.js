// Search criteria as search.js readCriteria() gives them, for the tests: every group is
// a list of instances; `c({name: [{givenName: 'Lars', surname: 'Halvorsen'}], ...})`
'use strict';

const GROUPS = ['name', 'sex', 'birth', 'marriage', 'death', 'emigration', 'residence', 'father', 'mother', 'spouse', 'child', 'farm'];

function criteria(groups = {}) {
  const c = {};
  for (const g of GROUPS) c[g] = groups[g] || [];
  return c;
}

module.exports = { criteria };
