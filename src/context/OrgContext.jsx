import { createContext, useContext, useState } from 'react';

const ORGANIZATIONS = [
  { id: 'PB', name: 'PB', color: '#6d4c9e' },
  { id: 'VB', name: 'VB', color: '#0097a7' },
  { id: 'AB', name: 'AB', color: '#c2185b' },
  { id: 'SB', name: 'SB', color: '#5d4037' },
];

const OrgContext = createContext(null);

export function OrgProvider({ children }) {
  const [selectedOrg, setSelectedOrgState] = useState(() => {
    return localStorage.getItem('selectedOrg') || 'PB';
  });

  const setSelectedOrg = (orgId) => {
    setSelectedOrgState(orgId);
    localStorage.setItem('selectedOrg', orgId);
  };

  const orgInfo = ORGANIZATIONS.find(o => o.id === selectedOrg) || ORGANIZATIONS[0];

  return (
    <OrgContext.Provider value={{ selectedOrg, setSelectedOrg, organizations: ORGANIZATIONS, orgInfo }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within OrgProvider');
  return ctx;
}

/** Helper: returns org-scoped Firestore collection path */
export function getOrgCollection(orgId, collection) {
  return `orgs/${orgId}/${collection}`;
}
