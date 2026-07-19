/** @param {{ rows: { id: number, label: string }[] }} props */
export function List({ rows }) {
	return (
		<ul>
			<li r-for="(row, i) in rows">
				<slot item={row} index={i}></slot>
			</li>
		</ul>
	);
}

/** @param {{ total: number }} props */
export function Box({ total }) {
	return <div><slot sum={total} /></div>;
}
