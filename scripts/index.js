module.exports = function ({ types: t }) {
	return {
		visitor: {
			JSXElement(path) {
				const vIfAttr = path.node.openingElement.attributes.find(
					(attr) => attr.name && attr.name.name === 'r-if'
				);
				if (vIfAttr) {
					const condition = vIfAttr.value.expression;
					path.node.openingElement.attributes =
						path.node.openingElement.attributes.filter(
							(attr) => attr !== vIfAttr
						);
					const conditionalExpression = t.conditionalExpression(
						condition,
						path.node,
						t.nullLiteral()
					);
					path.replaceWith(conditionalExpression);
				}
			},
		},
	};
};
