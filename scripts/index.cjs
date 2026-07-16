// Matches `(item, index) in items` (also of/from keywords).
const RFOR_RE =
	/^\s*\(\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\)\s+(?:in|of|from)\s+([\s\S]+?)\s*$/;

class DirectiveHandler {
	constructor(t, template, path) {
		this.t = t;
		this.template = template;
		this.path = path;
		this.node = path.node;
	}

	handleRFor() {
		const rForAttr = this._findAttr('r-for');
		if (!rForAttr) return false;

		const raw =
			rForAttr.value && rForAttr.value.type === 'StringLiteral'
				? rForAttr.value.value
				: null;
		if (raw === null) {
			throw this.path.buildCodeFrameError(
				'r-for expects a string value, e.g. r-for="(item, index) in items"'
			);
		}

		const match = raw.match(RFOR_RE);
		if (!match) {
			throw this.path.buildCodeFrameError(
				`Invalid r-for expression "${raw}". Expected "(item, index) in items".`
			);
		}
		const [, itemName, indexName, source] = match;

		this._removeAttr(rForAttr);

		const indexId = this.t.identifier(indexName);

		if (!this._findAttr('key')) {
			this.node.openingElement.attributes.push(
				this.t.jSXAttribute(
					this.t.jSXIdentifier('key'),
					this.t.jSXExpressionContainer(this.t.cloneNode(indexId))
				)
			);
		}

		const sourceExpr = this.template.expression.ast(source);
		const mapCall = this.t.callExpression(
			this.t.memberExpression(sourceExpr, this.t.identifier('map')),
			[
				this.t.arrowFunctionExpression(
					[this.t.identifier(itemName), indexId],
					this.node
				),
			]
		);

		const parent = this.path.parentPath;
		this.path.replaceWith(
			parent && (parent.isJSXElement() || parent.isJSXFragment())
				? this.t.jSXExpressionContainer(mapCall)
				: mapCall
		);
		return true;
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
				),
				elsePath.node
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

	_removeAttr(attr, node = this.node) {
		node.openingElement.attributes = node.openingElement.attributes.filter(
			(a) => a !== attr
		);
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

module.exports = function ({ types: t, template }) {
	return {
		visitor: {
			JSXElement(path) {
				const handler = new DirectiveHandler(t, template, path);
				handler.handleRFor() || handler.handleRIf() || handler.handleRShow();
			},
		},
	};
};
