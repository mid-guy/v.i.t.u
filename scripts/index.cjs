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

		this.path.replaceWith(this._asChild(mapCall));
		return true;
	}

	handleRIf() {
		const rIfAttr = this._findAttr('r-if');
		if (!rIfAttr) return false;

		const condition = this._expressionOf(rIfAttr, 'r-if');
		this._removeAttr(rIfAttr);

		// r-else pairs only with the element directly after r-if, both being
		// JSX children; whitespace between the two is allowed and dropped
		// with the pairing.
		const parent = this.path.parentPath;
		const siblings =
			parent && (parent.isJSXElement() || parent.isJSXFragment())
				? this.path.getAllNextSiblings()
				: [];
		const nextIndex = siblings.findIndex(
			(sibling) => !(sibling.isJSXText() && sibling.node.value.trim() === '')
		);
		const next = nextIndex === -1 ? null : siblings[nextIndex];
		const elseAttr =
			next && next.isJSXElement()
				? next.node.openingElement.attributes.find(
						(attr) => attr.name && attr.name.name === 'r-else'
					)
				: null;
		if (elseAttr) this._checkRElse(elseAttr, next);

		let alternate = this.t.nullLiteral();
		if (elseAttr) {
			this._removeAttr(elseAttr, next.node);
			alternate = next.node;
			siblings.slice(0, nextIndex + 1).forEach((s) => s.remove());
		}

		this.path.replaceWith(
			this._asChild(
				this.t.conditionalExpression(condition, this.node, alternate)
			)
		);
		return true;
	}

	handleRShow() {
		const rShowAttr = this._findAttr('r-show');
		if (!rShowAttr) return false;

		const condition = this._expressionOf(rShowAttr, 'r-show');
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

	// An r-else that is still on its element when the visitor gets there was
	// not claimed by an r-if: paired ones are removed by handleRIf().
	handleOrphanRElse() {
		const rElseAttr = this._findAttr('r-else');
		if (!rElseAttr) return;
		this._checkRElse(rElseAttr, this.path);
		throw this.path.buildCodeFrameError(
			'r-else must directly follow an element with r-if (and that element cannot also carry r-for)'
		);
	}

	_checkRElse(attr, path) {
		if (attr.value) {
			throw path.buildCodeFrameError('r-else takes no value');
		}
		const hasRIf = path.node.openingElement.attributes.some(
			(a) => a.name && a.name.name === 'r-if'
		);
		if (hasRIf) {
			throw path.buildCodeFrameError(
				'r-else and r-if cannot be used on the same element'
			);
		}
	}

	// The expression of `name={expression}`; anything else is a mistake.
	_expressionOf(attr, name) {
		const value = attr.value;
		if (
			!value ||
			value.type !== 'JSXExpressionContainer' ||
			value.expression.type === 'JSXEmptyExpression'
		) {
			throw this.path.buildCodeFrameError(
				`${name} expects an expression, e.g. ${name}={condition}`
			);
		}
		return value.expression;
	}

	// An expression replacing a JSX child has to sit in an expression
	// container, otherwise it prints as text: <div>ok ? <p /> : null</div>.
	_asChild(expr) {
		const parent = this.path.parentPath;
		return parent && (parent.isJSXElement() || parent.isJSXFragment())
			? this.t.jSXExpressionContainer(expr)
			: expr;
	}

	_findAttr(name) {
		return this.node.openingElement.attributes.find(
			(attr) => attr.name && attr.name.name === name
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
			const style = existingStyleAttr.value.expression;
			if (style.type === 'ObjectExpression') {
				style.properties.push(styleProperty);
			} else {
				// style={styles}: spread it so display is applied on top.
				existingStyleAttr.value.expression = this.t.objectExpression([
					this.t.spreadElement(style),
					styleProperty,
				]);
			}
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
				handler.handleOrphanRElse();
				handler.handleRFor() || handler.handleRIf() || handler.handleRShow();
			},
		},
	};
};
