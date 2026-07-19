type Row = { id: number; label: string };

function Table({ rows }: { rows: Row[] }) {
	return (
		<table>
			<tbody>
				<tr r-for="(row, i) in rows">
					<slot cell={row} index={i}></slot>
				</tr>
			</tbody>
		</table>
	);
}

export default function App() {
	const rows: Row[] = [{ id: 1, label: 'one' }];
	return (
		<Table rows={rows} r-slot="{ cell, index }">
			<td>{cell.label}</td>
			<td>{index}</td>
			<td>{cell.missing}</td>
		</Table>
	);
}
