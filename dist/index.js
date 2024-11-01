function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

var scripts;
var hasRequiredScripts;
function requireScripts() {
  if (hasRequiredScripts) return scripts;
  hasRequiredScripts = 1;
  scripts = function scripts(_ref) {
    var t = _ref.types;
    return {
      visitor: {
        JSXElement: function JSXElement(path) {
          var vIfAttr = path.node.openingElement.attributes.find(function (attr) {
            return attr.name && attr.name.name === 'r-if';
          });
          if (vIfAttr) {
            var condition = vIfAttr.value.expression;
            path.node.openingElement.attributes = path.node.openingElement.attributes.filter(function (attr) {
              return attr !== vIfAttr;
            });
            var conditionalExpression = t.conditionalExpression(condition, path.node, t.nullLiteral());
            path.replaceWith(conditionalExpression);
          }
        }
      }
    };
  };
  return scripts;
}

var scriptsExports = requireScripts();
var index = /*@__PURE__*/getDefaultExportFromCjs(scriptsExports);

export { index as default };
//# sourceMappingURL=index.js.map
