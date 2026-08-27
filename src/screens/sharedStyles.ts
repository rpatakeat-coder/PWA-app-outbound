import { StyleSheet } from 'react-native';

// Estilos compartilhados entre o App.tsx e as telas extraidas (prompt 02 do
// handoff). Movidos como estavam — nenhum valor mudou na extracao.
export const sharedStyles = StyleSheet.create({
  countChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },

  countChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'var(--surface-2)',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },

  countChipDot: { width: 8, height: 8, borderRadius: 4 },

  countChipText: { fontSize: 13, fontWeight: '700', color: 'var(--text-muted)' },

  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 60 },

  emptyStateText: { fontSize: 15, color: 'var(--text-subtle)' },

  listContent: { padding: 12 },

  panelTitle: { fontSize: 16, fontWeight: '800', color: 'var(--text)', marginBottom: 4 },

  smallActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'var(--surface-2)',
    borderWidth: 1,
    borderColor: 'var(--border)',
  },

  smallActionButtonText: { fontSize: 12, fontWeight: '700', color: 'var(--text)' },

  taskHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },

  taskVendorHint: { fontSize: 12, color: 'var(--tint-amber-text)', marginBottom: 10 },
  clientName: { fontSize: 15, fontWeight: '700', color: 'var(--text)', flex: 1 },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'var(--bg)',
    borderWidth: 1,
    borderColor: 'var(--border)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 8,
  },
  dropdownButtonText: { fontSize: 15, fontWeight: '600', color: 'var(--text)' },
  dropdownChevron: { fontSize: 16, color: 'var(--text-muted)' },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: 'var(--text-muted)', marginBottom: 8, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    // 12 -> 10: com ate 4 status ("Lead", "Cliente", "Ex-Cliente",
    // "Ganho - Field Sales") cada pixel poupado adia o corte na borda.
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'var(--surface-2)',
    marginRight: 6,
  },
  filterChipText: { fontSize: 12, fontWeight: '600', color: 'var(--text-muted)' },
  filterChipTextActive: { color: '#fff' },
  filterDot: { width: 8, height: 8, borderRadius: 4, marginRight: 5 },
  input: {
    backgroundColor: 'var(--bg)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'var(--border)',
    color: 'var(--text)',
  },
  routeActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  routePosition: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#222222',
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 26,
    marginRight: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'var(--surface-2)',
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 8,
  },
  searchInput: { flex: 1, minHeight: 44, color: 'var(--text)', fontSize: 14, padding: 0 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  submitButton: {
    backgroundColor: '#C8131B',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  mapaLinhaWeb: { flex: 1, flexDirection: 'row' },
  mapaAreaWeb: { flex: 1 },
  ltwBotaoOutline: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'var(--stroke-default)',
    backgroundColor: 'var(--surface)',
  },
  ltwBotaoOutlineTexto: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600', color: 'var(--text-muted)' },
  stageAccordionChevron: { fontSize: 13, color: 'var(--text-muted)', fontWeight: '800', marginLeft: 10 },
  stageAccordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'var(--surface)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'var(--border)',
  },
  stageAccordionMeta: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 },
  stageAccordionTitle: { fontSize: 15, fontWeight: '800', color: 'var(--text)' },
});

// dataSet do react-native-web (vira data-* no DOM; o CSS de public/index.html
// pendura hover/transicao/expansao da sidebar nesses atributos). Os tipos do
// react-native nao conhecem a prop — o cast vive aqui, num lugar so.
export const ds = (d: Record<string, string>) => ({ dataSet: d } as Record<string, unknown>);
