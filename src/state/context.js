import { createContext, useContext } from 'react'

export const NteContext = createContext(null)
export const useNte = () => useContext(NteContext)
