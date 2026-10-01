-- DDL reference for the MSCONV library (DB2 for i).
-- Owned by the IBMi team. This file is documentation only — the application
-- does not run or seed this DDL. Submit to the IBMi team to provision the
-- tables against the target system.
--
-- UPDATED_DATE_TIME is stamped by the application on every UPDATE
-- (CURRENT_TIMESTAMP); the DEFAULT only fires on INSERT.

CREATE TABLE MSCONV.CONVERSATION (
  ID                             INTEGER        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  PUBLIC_ID                      VARCHAR(36)    NOT NULL,      -- UUID v4; idempotency key
  TYPE                           VARCHAR(50)    NOT NULL,      -- ConversationType enum
  SUBJECT                        VARCHAR(500)   NOT NULL,
  STATUS                         VARCHAR(20)    NOT NULL,      -- ConversationStatus enum
  WAITING_ON                     VARCHAR(20),                  -- WaitingOn enum, nullable
  CUSTOMER_NAME                  VARCHAR(255)   NOT NULL,
  CUSTOMER_EMAIL                 VARCHAR(255)   NOT NULL,
  CONTEXT_JSON                   CLOB(16384),                 -- caller-owned string metadata
  EXTERNAL_REF                   VARCHAR(255),                 -- opaque link back to caller domain
  ACCESS_TOKEN                   VARCHAR(36)    NOT NULL,      -- UUID v4; customer access (R4)
  LATEST_MESSAGE_ID              INTEGER,                      -- denormalized; updated on append
  CUSTOMER_LAST_READ_MESSAGE_ID  INTEGER,
  CREATED_DATE_TIME              TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UPDATED_DATE_TIME              TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CREATED_BY                     VARCHAR(255),
  UPDATED_BY                     VARCHAR(255),
  CONSTRAINT CONV_PUBLIC_ID_UQ   UNIQUE (PUBLIC_ID),
  CONSTRAINT CONV_ACCESS_TKN_UQ  UNIQUE (ACCESS_TOKEN)
);

CREATE TABLE MSCONV.MESSAGE (
  ID               INTEGER        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  CONVERSATION_ID  INTEGER        NOT NULL REFERENCES MSCONV.CONVERSATION(ID),
  AUTHOR_TYPE      VARCHAR(20)    NOT NULL,                    -- AuthorType enum
  AUTHOR_ID        VARCHAR(255),                               -- x-user-id for AGENT; null for SYSTEM/CUSTOMER
  BODY_JSON        CLOB(1048576)  NOT NULL,                   -- TipTap JSON document, max 1 MB
  VISIBILITY       VARCHAR(20)    NOT NULL,                    -- MessageVisibility enum
  CREATED_DATE_TIME TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CREATED_BY       VARCHAR(255)
);

-- ---------------------------------------------------------------------------
-- JOURNALING (required — run after CREATE TABLE)
--
-- The application uses commitment control (transactions). DB2 for i requires
-- all tables participating in a transaction to be journaled. DBeaver works
-- without journaling because it uses autocommit; the application does not.
--
-- Option A — set a library-level default journal so all future tables in the
-- library are journaled automatically (recommended for the dev/prod schemas):
--
--   CHGLIB LIB(MSCONV) JRNLIB(MSCONV) JRN(QSQJRN)
--
-- Option B — start journaling on the two physical files explicitly.
-- IBM i auto-generates 10-char system names for long SQL table names; use
-- DSPFD or check the file name shown in any SQL7008 error message:
--
--   STRJRNPF FILE(MSCONV/<system-name-for-CONVERSATION>) JRN(MSCONV/QSQJRN)
--   STRJRNPF FILE(MSCONV/<system-name-for-MESSAGE>)      JRN(MSCONV/QSQJRN)
--
-- QSQJRN is the default journal name created by IBM i when the library is
-- set up for SQL. If it does not exist, create it first:
--
--   CRTJRNRCV JRNRCV(MSCONV/MSCONVR0001)
--   CRTJRN    JRN(MSCONV/QSQJRN) JRNRCV(MSCONV/MSCONVR0001)
-- ---------------------------------------------------------------------------


CREATE TABLE MSCONV.CONVERSATION_AGENT (
  CONVERSATION_ID INTEGER NOT NULL REFERENCES MSCONV.CONVERSATION(ID),
  AGENT_ID VARCHAR(255) NOT NULL,
  EMAIL VARCHAR(255),
  NAME VARCHAR(255),
  SUBSCRIBED SMALLINT NOT NULL DEFAULT 0,
  LAST_READ_MESSAGE_ID INTEGER,
  UPDATED_DATE_TIME TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (CONVERSATION_ID, AGENT_ID)
);
-- Journal CONVERSATION_AGENT before enabling transactions against it.

CREATE INDEX MSCONV.MESSAGE_UNREAD_IDX ON MSCONV.MESSAGE (CONVERSATION_ID, AUTHOR_TYPE, VISIBILITY, ID);
