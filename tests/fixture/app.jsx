// Real InstUI components, at the version Canvas pins, in the shapes the issues report.
// Files, the Gradebook and trays sit behind a login, so this is how they get checked
// without one. Keep the versions in package.json in step with canvas-lms.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { InstUISettingsProvider } from '@instructure/emotion';
import { canvas } from '@instructure/ui-themes';
import { Table } from '@instructure/ui-table';
import { Alert } from '@instructure/ui-alerts';
import { TextInput } from '@instructure/ui-text-input';
import { Tray } from '@instructure/ui-tray';
import { Menu } from '@instructure/ui-menu';
import { Link } from '@instructure/ui-link';
import { Text } from '@instructure/ui-text';
import { Button } from '@instructure/ui-buttons';

function FilesTable() {
  return (
    <Table caption="Files" id="files">
      <Table.Head>
        <Table.Row>
          <Table.ColHeader id="name">Name</Table.ColHeader>
          <Table.ColHeader id="created">Created</Table.ColHeader>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {['Syllabus.pdf', 'Week 1 notes.docx'].map((name) => (
          <Table.Row key={name}>
            <Table.RowHeader>
              <Link href="#file">{name}</Link>
            </Table.RowHeader>
            <Table.Cell>Sep 21, 2026</Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}

function App() {
  return (
    <InstUISettingsProvider theme={canvas}>
      <FilesTable />
      <Alert variant="info" margin="small">Files were updated</Alert>
      <TextInput renderLabel="Search files" placeholder="Search" />
      <Text>Plain InstUI text</Text>
      <Button color="primary" href="#submit" id="link-button">Submit</Button>
      <Menu trigger={<Button>Download</Button>} defaultShow mountNode={() => document.getElementById('menu-host')}>
        <Menu.Item href="#pdf">PDF</Menu.Item>
        <Menu.Item href="#docx">Word</Menu.Item>
      </Menu>
      <Tray label="Details" open placement="end" size="small">
        <Text as="p">Tray text</Text>
        <Link href="#more">Tray link</Link>
      </Tray>
    </InstUISettingsProvider>
  );
}

createRoot(document.getElementById('app')).render(<App />);
