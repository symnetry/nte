import React from 'react'
import { NteProvider, useNte } from './state/useNteState.jsx'
import Board from './components/Board.jsx'
import ContainerPanel from './components/panels/ContainerPanel.jsx'
import BlockLib from './components/panels/BlockLib.jsx'
import SetEditor from './components/panels/SetEditor.jsx'
import ConditionPanel from './components/panels/ConditionPanel.jsx'
import ActionsPanel from './components/panels/ActionsPanel.jsx'
import SubstatPanel from './components/panels/SubstatPanel.jsx'
import JsonModal from './components/JsonModal.jsx'
import ConfirmDialog from './components/ConfirmDialog.jsx'

function Layout() {
  const { status } = useNte()
  return (
    <>
      <div id="sidebar">
        <ContainerPanel />
        <BlockLib />
        <ConditionPanel />
        <SetEditor />
        <ActionsPanel />
      </div>
      <div id="main">
        <Board />
        <div id="status" style={{ color: status.isError ? '#ff6b6b' : '#8b95a8' }}>{status.msg}</div>
        <SubstatPanel />
      </div>
      <JsonModal />
      <ConfirmDialog />
    </>
  )
}

export default function App() {
  return (
    <NteProvider>
      <Layout />
    </NteProvider>
  )
}
