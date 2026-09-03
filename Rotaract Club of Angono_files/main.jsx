import __vite__cjsImport0_react_jsxDevRuntime from "/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=c7922a58"; const jsxDEV = __vite__cjsImport0_react_jsxDevRuntime["jsxDEV"];
import __vite__cjsImport1_react from "/node_modules/.vite/deps/react.js?v=c7922a58"; const React = __vite__cjsImport1_react.__esModule ? __vite__cjsImport1_react.default : __vite__cjsImport1_react;
import __vite__cjsImport2_reactDom_client from "/node_modules/.vite/deps/react-dom_client.js?v=c7922a58"; const ReactDOM = __vite__cjsImport2_reactDom_client.__esModule ? __vite__cjsImport2_reactDom_client.default : __vite__cjsImport2_reactDom_client;
import { BrowserRouter } from "/node_modules/.vite/deps/react-router-dom.js?v=c7922a58";
import App from "/src/App.jsx";
import { AuthProvider } from "/src/context/AuthContext.jsx";
import { ToastProvider } from "/src/context/ToastContext.jsx";
import "/src/index.css";
if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}
window.addEventListener("pageshow", () => {
  if (window.location.hash) return;
  window.scrollTo(0, 0);
  requestAnimationFrame(() => window.scrollTo(0, 0));
});
ReactDOM.createRoot(document.getElementById("root")).render(
  /* @__PURE__ */ jsxDEV(React.StrictMode, { children: /* @__PURE__ */ jsxDEV(BrowserRouter, { children: /* @__PURE__ */ jsxDEV(ToastProvider, { children: /* @__PURE__ */ jsxDEV(AuthProvider, { children: /* @__PURE__ */ jsxDEV(App, {}, void 0, false, {
    fileName: "/Users/jonahmicahinguito/dev/rotaract copy/src/main.jsx",
    lineNumber: 35,
    columnNumber: 11
  }, this) }, void 0, false, {
    fileName: "/Users/jonahmicahinguito/dev/rotaract copy/src/main.jsx",
    lineNumber: 34,
    columnNumber: 9
  }, this) }, void 0, false, {
    fileName: "/Users/jonahmicahinguito/dev/rotaract copy/src/main.jsx",
    lineNumber: 33,
    columnNumber: 7
  }, this) }, void 0, false, {
    fileName: "/Users/jonahmicahinguito/dev/rotaract copy/src/main.jsx",
    lineNumber: 32,
    columnNumber: 5
  }, this) }, void 0, false, {
    fileName: "/Users/jonahmicahinguito/dev/rotaract copy/src/main.jsx",
    lineNumber: 31,
    columnNumber: 3
  }, this)
);

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJtYXBwaW5ncyI6IkFBa0NVO0FBbENWLE9BQU9BLFdBQVc7QUFDbEIsT0FBT0MsY0FBYztBQUNyQixTQUFTQyxxQkFBcUI7QUFDOUIsT0FBT0MsU0FBUztBQUNoQixTQUFTQyxvQkFBb0I7QUFDN0IsU0FBU0MscUJBQXFCO0FBQzlCLE9BQU87QUFLUCxJQUFJLHVCQUF1QkMsU0FBUztBQUNsQ0EsVUFBUUMsb0JBQW9CO0FBQzlCO0FBVUFDLE9BQU9DLGlCQUFpQixZQUFZLE1BQU07QUFDeEMsTUFBSUQsT0FBT0UsU0FBU0MsS0FBTTtBQUMxQkgsU0FBT0ksU0FBUyxHQUFHLENBQUM7QUFDcEJDLHdCQUFzQixNQUFNTCxPQUFPSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQ25ELENBQUM7QUFFRFgsU0FBU2EsV0FBV0MsU0FBU0MsZUFBZSxNQUFNLENBQUMsRUFBRUM7QUFBQUEsRUFDbkQsdUJBQUMsTUFBTSxZQUFOLEVBQ0MsaUNBQUMsaUJBQ0MsaUNBQUMsaUJBQ0MsaUNBQUMsZ0JBQ0MsaUNBQUMsU0FBRDtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQUksS0FETjtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBRUEsS0FIRjtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBSUEsS0FMRjtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBTUEsS0FQRjtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBUUE7QUFDRiIsIm5hbWVzIjpbIlJlYWN0IiwiUmVhY3RET00iLCJCcm93c2VyUm91dGVyIiwiQXBwIiwiQXV0aFByb3ZpZGVyIiwiVG9hc3RQcm92aWRlciIsImhpc3RvcnkiLCJzY3JvbGxSZXN0b3JhdGlvbiIsIndpbmRvdyIsImFkZEV2ZW50TGlzdGVuZXIiLCJsb2NhdGlvbiIsImhhc2giLCJzY3JvbGxUbyIsInJlcXVlc3RBbmltYXRpb25GcmFtZSIsImNyZWF0ZVJvb3QiLCJkb2N1bWVudCIsImdldEVsZW1lbnRCeUlkIiwicmVuZGVyIl0sImlnbm9yZUxpc3QiOltdLCJzb3VyY2VzIjpbIm1haW4uanN4Il0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBSZWFjdCBmcm9tICdyZWFjdCc7XG5pbXBvcnQgUmVhY3RET00gZnJvbSAncmVhY3QtZG9tL2NsaWVudCc7XG5pbXBvcnQgeyBCcm93c2VyUm91dGVyIH0gZnJvbSAncmVhY3Qtcm91dGVyLWRvbSc7XG5pbXBvcnQgQXBwIGZyb20gJy4vQXBwLmpzeCc7XG5pbXBvcnQgeyBBdXRoUHJvdmlkZXIgfSBmcm9tICcuL2NvbnRleHQvQXV0aENvbnRleHQuanN4JztcbmltcG9ydCB7IFRvYXN0UHJvdmlkZXIgfSBmcm9tICcuL2NvbnRleHQvVG9hc3RDb250ZXh0LmpzeCc7XG5pbXBvcnQgJy4vaW5kZXguY3NzJztcblxuLy8gUmVsb2FkcyBzdGFydCBhdCB0aGUgdG9wIG9mIHRoZSBwYWdlIGluc3RlYWQgb2YgcmVzdG9yaW5nIHRoZSBwcmV2aW91c1xuLy8gc2Nyb2xsIHBvc2l0aW9uLiBUaGlzIG11c3QgcnVuIGJlZm9yZSBSZWFjdCByZW5kZXJzIHNvIHRoZSBicm93c2VyIG5ldmVyXG4vLyBqdW1wcyBiYWNrIHRvIHRoZSBtaWRkbGUgb2YgdGhlIHBhZ2UuXG5pZiAoJ3Njcm9sbFJlc3RvcmF0aW9uJyBpbiBoaXN0b3J5KSB7XG4gIGhpc3Rvcnkuc2Nyb2xsUmVzdG9yYXRpb24gPSAnbWFudWFsJztcbn1cblxuLy8gYHNjcm9sbFJlc3RvcmF0aW9uID0gJ21hbnVhbCdgIGFsb25lIGlzIG5vdCBlbm91Z2g6IHNvbWUgYnJvd3NlcnMgKFNhZmFyaSBpblxuLy8gcGFydGljdWxhcikgaWdub3JlIGl0IG9uIHJlbG9hZCBhbmQgcmUtYXBwbHkgdGhlIHNhdmVkIHNjcm9sbCBvZmZzZXQgQUZURVJcbi8vIFJlYWN0IGhhcyBhbHJlYWR5IHBhaW50ZWQsIHdoaWNoIG92ZXJyaWRlcyBTY3JvbGxUb1RvcCdzIHJlc2V0LiBgcGFnZXNob3dgXG4vLyBmaXJlcyBhZnRlciB0aGUgYnJvd3NlciBmaW5pc2hlcyBpdHMgc2Nyb2xsLXJlc3RvcmF0aW9uIHBhc3MsIHNvIGZvcmNpbmcgdGhlXG4vLyB0b3AgdGhlcmUgcmVsaWFibHkgd2lucyBpbiBldmVyeSBicm93c2VyIChhbmQgYWxzbyBjb3ZlcnMgYmFjay9mb3J3YXJkLWNhY2hlXG4vLyByZXN0b3JlcykuIFRoZSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgcmUtYXNzZXJ0IGhhbmRsZXMgYnJvd3NlcnMgdGhhdCBzY2hlZHVsZVxuLy8gcmVzdG9yYXRpb24gYSBiZWF0IGFmdGVyIHBhZ2VzaG93LiBIYXNoIFVSTHMgYXJlIHNraXBwZWQgc28gaW4tcGFnZSBhbmNob3JzXG4vLyAoYC9hYm91dCNob3ctdG8tam9pbmApIHN0aWxsIHNjcm9sbCB0byB0aGVpciB0YXJnZXQgdmlhIHVzZUhhc2hTY3JvbGwuXG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncGFnZXNob3cnLCAoKSA9PiB7XG4gIGlmICh3aW5kb3cubG9jYXRpb24uaGFzaCkgcmV0dXJuO1xuICB3aW5kb3cuc2Nyb2xsVG8oMCwgMCk7XG4gIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB3aW5kb3cuc2Nyb2xsVG8oMCwgMCkpO1xufSk7XG5cblJlYWN0RE9NLmNyZWF0ZVJvb3QoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Jvb3QnKSkucmVuZGVyKFxuICA8UmVhY3QuU3RyaWN0TW9kZT5cbiAgICA8QnJvd3NlclJvdXRlcj5cbiAgICAgIDxUb2FzdFByb3ZpZGVyPlxuICAgICAgICA8QXV0aFByb3ZpZGVyPlxuICAgICAgICAgIDxBcHAgLz5cbiAgICAgICAgPC9BdXRoUHJvdmlkZXI+XG4gICAgICA8L1RvYXN0UHJvdmlkZXI+XG4gICAgPC9Ccm93c2VyUm91dGVyPlxuICA8L1JlYWN0LlN0cmljdE1vZGU+XG4pO1xuIl0sImZpbGUiOiIvVXNlcnMvam9uYWhtaWNhaGluZ3VpdG8vZGV2L3JvdGFyYWN0IGNvcHkvc3JjL21haW4uanN4In0=