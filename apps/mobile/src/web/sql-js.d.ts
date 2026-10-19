// sql.js's browser build (no Node `fs`), typed as the package's main entry.
declare module 'sql.js/dist/sql-wasm-browser.js' {
  import initSqlJs from 'sql.js';
  export default initSqlJs;
}
