// M4 PR 7: lets the "can't read the data" screen tell the v3 frame (App.tsx) that the data was replaced
// (start over / restore), so the page behind it is built again and reads the new data.
import { createContext, useContext } from 'react';

export const RecoveryContext = createContext<() => void>(() => {});
export const useRecovered = (): (() => void) => useContext(RecoveryContext);
