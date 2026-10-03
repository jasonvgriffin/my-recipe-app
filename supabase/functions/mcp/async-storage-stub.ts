// The MCP server never uses on-device storage. Some app modules reach `@/storage/*` through type-only
// imports; this stub keeps Deno's module graph resolvable without bundling React Native.
const unavailable = () => Promise.reject(new Error('AsyncStorage is not available on the server'));
export default { getItem: unavailable, setItem: unavailable, removeItem: unavailable, clear: unavailable, getAllKeys: unavailable, multiGet: unavailable };
