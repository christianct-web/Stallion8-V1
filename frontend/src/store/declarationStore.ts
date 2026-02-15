// Declaration Store - Local storage-based state management
// In production, this would connect to Lovable Cloud/Supabase

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  Declaration,
  DeclarationPayload,
  DeclarationItem,
  createNewDeclaration,
  createEmptyItem,
} from "@/types/declaration";

interface DeclarationStore {
  declarations: Declaration[];
  currentDeclarationId: string | null;

  // CRUD operations
  createDeclaration: () => Declaration;
  duplicateDeclaration: (id: string) => Declaration | null;
  deleteDeclaration: (id: string) => void;
  getDeclaration: (id: string) => Declaration | undefined;
  
  // Editor state
  setCurrentDeclaration: (id: string | null) => void;
  getCurrentDeclaration: () => Declaration | undefined;
  
  // Payload updates
  updatePayload: <K extends keyof DeclarationPayload>(
    id: string,
    section: K,
    data: Partial<DeclarationPayload[K]>
  ) => void;
  updateReferenceNumber: (id: string, refNumber: string) => void;
  
  // Item operations
  addItem: (id: string) => void;
  updateItem: (declarationId: string, itemId: string, data: Partial<DeclarationItem>) => void;
  removeItem: (declarationId: string, itemId: string) => void;
  duplicateItem: (declarationId: string, itemId: string) => void;
  
  // Status updates
  setStatus: (id: string, status: Declaration["status"]) => void;
  setValidationReport: (id: string, report: Declaration["last_validation_report"]) => void;
  setExportedXml: (id: string, xml: string) => void;
}

export const useDeclarationStore = create<DeclarationStore>()(
  persist(
    (set, get) => ({
      declarations: [],
      currentDeclarationId: null,

      createDeclaration: () => {
        const newDeclaration = createNewDeclaration();
        set((state) => ({
          declarations: [...state.declarations, newDeclaration],
          currentDeclarationId: newDeclaration.id,
        }));
        return newDeclaration;
      },

      duplicateDeclaration: (id) => {
        const source = get().declarations.find((d) => d.id === id);
        if (!source) return null;

        const now = new Date().toISOString();
        const duplicated: Declaration = {
          ...source,
          id: crypto.randomUUID(),
          reference_number: `${source.reference_number}-COPY`,
          status: "Draft",
          last_validation_report: null,
          last_exported_xml: null,
          created_at: now,
          updated_at: now,
          payload_json: JSON.parse(JSON.stringify(source.payload_json)),
        };

        set((state) => ({
          declarations: [...state.declarations, duplicated],
        }));

        return duplicated;
      },

      deleteDeclaration: (id) => {
        set((state) => ({
          declarations: state.declarations.filter((d) => d.id !== id),
          currentDeclarationId:
            state.currentDeclarationId === id ? null : state.currentDeclarationId,
        }));
      },

      getDeclaration: (id) => {
        return get().declarations.find((d) => d.id === id);
      },

      setCurrentDeclaration: (id) => {
        set({ currentDeclarationId: id });
      },

      getCurrentDeclaration: () => {
        const { declarations, currentDeclarationId } = get();
        return declarations.find((d) => d.id === currentDeclarationId);
      },

      updatePayload: (id, section, data) => {
        set((state) => ({
          declarations: state.declarations.map((d) => {
            if (d.id !== id) return d;
            
            // Handle items array separately
            if (section === "items") {
              return {
                ...d,
                payload_json: {
                  ...d.payload_json,
                  items: data as unknown as DeclarationItem[],
                },
                updated_at: new Date().toISOString(),
                // Reset to Draft on any change
                status: "Draft" as const,
                last_validation_report: null,
              };
            }

            return {
              ...d,
              payload_json: {
                ...d.payload_json,
                [section]: {
                  ...d.payload_json[section],
                  ...data,
                },
              },
              updated_at: new Date().toISOString(),
              status: "Draft" as const,
              last_validation_report: null,
            };
          }),
        }));
      },

      updateReferenceNumber: (id, refNumber) => {
        set((state) => ({
          declarations: state.declarations.map((d) =>
            d.id === id
              ? { ...d, reference_number: refNumber, updated_at: new Date().toISOString() }
              : d
          ),
        }));
      },

      addItem: (id) => {
        set((state) => ({
          declarations: state.declarations.map((d) => {
            if (d.id !== id) return d;
            const nextLineNumber = d.payload_json.items.length + 1;
            return {
              ...d,
              payload_json: {
                ...d.payload_json,
                items: [...d.payload_json.items, createEmptyItem(nextLineNumber)],
              },
              updated_at: new Date().toISOString(),
              status: "Draft" as const,
              last_validation_report: null,
            };
          }),
        }));
      },

      updateItem: (declarationId, itemId, data) => {
        set((state) => ({
          declarations: state.declarations.map((d) => {
            if (d.id !== declarationId) return d;
            return {
              ...d,
              payload_json: {
                ...d.payload_json,
                items: d.payload_json.items.map((item) =>
                  item.id === itemId ? { ...item, ...data } : item
                ),
              },
              updated_at: new Date().toISOString(),
              status: "Draft" as const,
              last_validation_report: null,
            };
          }),
        }));
      },

      removeItem: (declarationId, itemId) => {
        set((state) => ({
          declarations: state.declarations.map((d) => {
            if (d.id !== declarationId) return d;
            const filteredItems = d.payload_json.items.filter((item) => item.id !== itemId);
            // Renumber items
            const renumberedItems = filteredItems.map((item, index) => ({
              ...item,
              line_number: index + 1,
            }));
            return {
              ...d,
              payload_json: {
                ...d.payload_json,
                items: renumberedItems,
              },
              updated_at: new Date().toISOString(),
              status: "Draft" as const,
              last_validation_report: null,
            };
          }),
        }));
      },

      duplicateItem: (declarationId, itemId) => {
        set((state) => ({
          declarations: state.declarations.map((d) => {
            if (d.id !== declarationId) return d;
            const sourceItem = d.payload_json.items.find((item) => item.id === itemId);
            if (!sourceItem) return d;

            const newItem: DeclarationItem = {
              ...sourceItem,
              id: crypto.randomUUID(),
              line_number: d.payload_json.items.length + 1,
            };

            return {
              ...d,
              payload_json: {
                ...d.payload_json,
                items: [...d.payload_json.items, newItem],
              },
              updated_at: new Date().toISOString(),
              status: "Draft" as const,
              last_validation_report: null,
            };
          }),
        }));
      },

      setStatus: (id, status) => {
        set((state) => ({
          declarations: state.declarations.map((d) =>
            d.id === id ? { ...d, status, updated_at: new Date().toISOString() } : d
          ),
        }));
      },

      setValidationReport: (id, report) => {
        set((state) => ({
          declarations: state.declarations.map((d) =>
            d.id === id
              ? {
                  ...d,
                  last_validation_report: report,
                  status: report?.status === "pass" ? ("Ready" as const) : ("Draft" as const),
                  updated_at: new Date().toISOString(),
                }
              : d
          ),
        }));
      },

      setExportedXml: (id, xml) => {
        set((state) => ({
          declarations: state.declarations.map((d) =>
            d.id === id
              ? {
                  ...d,
                  last_exported_xml: xml,
                  status: "Exported" as const,
                  updated_at: new Date().toISOString(),
                }
              : d
          ),
        }));
      },
    }),
    {
      name: "ace-declarations-storage",
    }
  )
);
