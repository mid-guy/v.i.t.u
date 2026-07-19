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

	// Consumer side: `<List rows={rows} r-slot="{ item }">body</List>` turns
	// the children into a render function taking the slot props.
	//
	//   <List rows={rows}>{({ item }) => <>body</>}</List>
	handleRSlot() {
		const rSlotAttr = this._findAttr(['r-slot', 'v-slot']);
		if (!rSlotAttr) return false;

		const raw =
			rSlotAttr.value && rSlotAttr.value.type === 'StringLiteral'
				? rSlotAttr.value.value.trim()
				: null;
		if (!raw) {
			throw this.path.buildCodeFrameError(
				'r-slot expects a string binding pattern, e.g. r-slot="{ item, index }"'
			);
		}

		this._removeAttr(rSlotAttr);

		let param;
		try {
			// The pattern is parsed as the parameter of a throwaway arrow.
			param = this.template.expression.ast(`(${raw}) => 0`).params[0];
		} catch {
			throw this.path.buildCodeFrameError(
				`Invalid r-slot pattern "${raw}". Expected "{ item, index }".`
			);
		}

		const body = this.t.jSXFragment(
			this.t.jSXOpeningFragment(),
			this.t.jSXClosingFragment(),
			this.node.children
		);
		this.node.children = [
			this.t.jSXExpressionContainer(
				this.t.arrowFunctionExpression([param], body)
			),
		];
		return true;
	}

	// Component side: `<slot item={x} />` calls the children render function
	// with the slot props, falling back to the outlet's own children.
	//
	//   {typeof children === 'function' ? children({ item: x }) : <>fallback</>}
	handleSlot() {
		const opening = this.node.openingElement;
		if (!opening.name || opening.name.name !== 'slot') return false;

		const props = [];
		for (const attr of opening.attributes) {
			if (attr.type === 'JSXSpreadAttribute') {
				props.push(this.t.spreadElement(attr.argument));
				continue;
			}
			if (!attr.name || attr.name.name === 'name') continue;
			const key = attr.name.name;
			const id = /^[A-Za-z_$][\w$]*$/.test(key)
				? this.t.identifier(key)
				: this.t.stringLiteral(key);
			let value;
			if (!attr.value) value = this.t.booleanLiteral(true);
			else if (attr.value.type === 'JSXExpressionContainer')
				value = attr.value.expression;
			else value = attr.value;
			props.push(this.t.objectProperty(id, value));
		}

		const children = this._childrenRef();
		if (!children) return false; // no enclosing component to take children
		const call = this.t.callExpression(this.t.cloneNode(children), [
			this.t.objectExpression(props),
		]);
		const fallback = this.node.children.length
			? this.t.jSXFragment(
					this.t.jSXOpeningFragment(),
					this.t.jSXClosingFragment(),
					this.node.children
				)
			: this.t.nullLiteral();

		const expr = this.t.conditionalExpression(
			this.t.binaryExpression(
				'===',
				this.t.unaryExpression('typeof', this.t.cloneNode(children)),
				this.t.stringLiteral('function')
			),
			call,
			fallback
		);

		const parent = this.path.parentPath;
		this.path.replaceWith(
			parent && (parent.isJSXElement() || parent.isJSXFragment())
				? this.t.jSXExpressionContainer(expr)
				: expr
		);
		return true;
	}

	// How the enclosing component reaches its children render prop, adding
	// the binding when the author destructured props without it.
	_childrenRef() {
		// The component, not a callback around the outlet: an r-for already
		// transformed into `.map((row, i) => ...)` (or a hand-written .map)
		// is a call argument, and its params are loop bindings.
		let fnPath = this.path.getFunctionParent();
		while (fnPath && fnPath.parentPath && fnPath.parentPath.isCallExpression()) {
			fnPath = fnPath.getFunctionParent();
		}
		if (!fnPath) return null;

		const params = fnPath.node.params;
		if (!params.length) {
			params.push(
				this.t.objectPattern([
					this.t.objectProperty(
						this.t.identifier('children'),
						this.t.identifier('children'),
						false,
						true
					),
				])
			);
			return this.t.identifier('children');
		}

		const first = params[0];
		if (first.type === 'Identifier') {
			return this.t.memberExpression(
				this.t.identifier(first.name),
				this.t.identifier('children')
			);
		}
		if (first.type === 'ObjectPattern') {
			for (const prop of first.properties) {
				if (
					prop.type === 'ObjectProperty' &&
					prop.key &&
					prop.key.name === 'children' &&
					prop.value.type === 'Identifier'
				) {
					return this.t.identifier(prop.value.name);
				}
			}
			first.properties.unshift(
				this.t.objectProperty(
					this.t.identifier('children'),
					this.t.identifier('children'),
					false,
					true
				)
			);
			return this.t.identifier('children');
		}
		return null;
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
				if (handler.handleSlot()) return;
				handler.handleRSlot();
				handler.handleRFor() || handler.handleRIf() || handler.handleRShow();
			},
		},
	};
};
