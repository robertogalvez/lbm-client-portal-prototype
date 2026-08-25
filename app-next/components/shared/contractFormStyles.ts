// Shared inline style constants for the contract-editing surface
// (ContractChannelsDrawer), kept out of the component so the form fields
// stay visually consistent wherever they are reused.

export const inp: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 14,
  border: '1px solid #d4dbe2', borderRadius: 8,
  boxSizing: 'border-box', fontFamily: 'inherit', color: '#111c28',
  background: '#fff', outline: 'none',
};

export const label: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#54616f',
  marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
};

export const fieldCap: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: '#8b97a4',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.03em',
};

export const smallBtn: React.CSSProperties = {
  flex: 1, padding: '7px 12px', borderRadius: 7, fontWeight: 600, fontSize: 13,
  cursor: 'pointer', fontFamily: 'inherit', border: '1px solid #d4dbe2', background: '#fff', color: '#54616f',
};
export function smallSaveBtn(disabled: boolean): React.CSSProperties {
  return { ...smallBtn, flex: 'unset', border: 'none', background: disabled ? '#eef1f4' : '#FF6000', color: disabled ? '#8b97a4' : '#fff' };
}
export const linkBtn: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: '#FF6000', background: 'none', border: 'none',
  cursor: 'pointer', padding: 0, fontFamily: 'inherit',
};
