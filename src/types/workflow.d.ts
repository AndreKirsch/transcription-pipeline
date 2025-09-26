export interface DropboxConnection {
  access_token: string;
  root_path: string;
  file_extensions: string[];
  exclude_folders?: string[];
  only_new_files?: boolean;
}

export interface OpenAIConnection {
  api_key: string;
  model: string;
  language?: string;
  prompt?: string;
}

export interface MongoConnection {
  uri: string;
  database: string;
  collection: string;
  processed_collection?: string;
}

export type StepAction = 'download_files' | 'gpt_transcribe' | 'insert_documents';

export interface WorkflowStep {
  id: string;
  action: StepAction;
  from?: string;
  to?: string;
  input?: string;
  output?: string;
  save_to?: string;
  document_template?: Record<string, string>;
  prompt?: string;
}

export interface WorkflowSchedule {
  interval?: string;
  cron?: string;
  timezone?: string;
}

export interface WorkflowDefinition {
  workflow: {
    name: string;
    description: string;
    schedule: WorkflowSchedule;
    connections: {
      dropbox: DropboxConnection;
      openai: OpenAIConnection;
      mongodb: MongoConnection;
    };
    steps: WorkflowStep[];
  };
}
