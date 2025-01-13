class DirectiveHandler {
	constructor(t, path) {
		this.t = t;
		this.path = path;
		this.node = path.node;
	}

	handleRIf() {
		const rIfAttr = this._findAttr('r-if');
		if (!rIfAttr) return false;

		const condition = rIfAttr.value.expression;
		this._removeAttr(rIfAttr);

		const siblings = this.path.getAllNextSiblings();
		const elseElement = siblings.find((sibling) => {
			const el = sibling.node;
			return (
				el &&
				el.openingElement &&
				el.openingElement.attributes.some(
					(attr) => attr.name && attr.name.name === 'r-else'
				)
			);
		});

		if (elseElement) {
			const elsePath = siblings[siblings.indexOf(elseElement)];
			this._removeAttr(
				elsePath.node.openingElement.attributes.find(
					(attr) => attr.name && attr.name.name === 'r-else'
				)
			);
			siblings
				.slice(0, siblings.indexOf(elseElement))
				.forEach((s) => s.remove());

			const conditionalExpression = this.t.conditionalExpression(
				condition,
				this.node,
				elsePath.node
			);

			this.path.replaceWith(conditionalExpression);
			elsePath.remove();
		} else {
			const conditionalExpression = this.t.conditionalExpression(
				condition,
				this.node,
				this.t.nullLiteral()
			);
			this.path.replaceWith(conditionalExpression);
		}
		return true;
	}

	handleRShow() {
		const rShowAttr = this._findAttr('r-show');
		if (!rShowAttr) return false;

		const condition = rShowAttr.value.expression;
		this._removeAttr(rShowAttr);

		const styleProperty = this.t.objectProperty(
			this.t.identifier('display'),
			this.t.conditionalExpression(
				condition,
				this.t.stringLiteral(''),
				this.t.stringLiteral('none')
			)
		);

		this._mergeStyle(styleProperty);
		return true;
	}

	_findAttr(names) {
		names = Array.isArray(names) ? names : [names];
		return this.node.openingElement.attributes.find(
			(attr) => attr.name && names.includes(attr.name.name)
		);
	}

	_removeAttr(attr) {
		this.node.openingElement.attributes =
			this.node.openingElement.attributes.filter((a) => a !== attr);
	}

	_mergeStyle(styleProperty) {
		const existingStyleAttr = this._findAttr('style');

		if (existingStyleAttr) {
			existingStyleAttr.value.expression.properties.push(styleProperty);
		} else {
			this.node.openingElement.attributes.push(
				this.t.jSXAttribute(
					this.t.jSXIdentifier('style'),
					this.t.jSXExpressionContainer(
						this.t.objectExpression([styleProperty])
					)
				)
			);
		}
	}
}

module.exports = function ({ types: t }) {
	return {
		visitor: {
			JSXElement(path) {
				const handler = new DirectiveHandler(t, path);
				handler.handleRIf() || handler.handleRShow();
			},
		},
	};
};
