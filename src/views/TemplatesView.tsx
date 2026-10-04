import React, { useState, useEffect } from 'react';
import { BookmarkCheck, Plus, Copy, Trash2, Edit2, X, Check, FileCheck2 } from 'lucide-react';
import { Template } from '../types';
import { api } from '../api';
import { useToast } from '../components/Toast';

export const TemplatesView: React.FC = () => {
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form states for creating / editing
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Bookkeeping');
  const [requirements, setRequirements] = useState<Array<{ name: string; description: string; required: boolean }>>([
    { name: '', description: '', required: true },
  ]);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const data = await api.getTemplates();
      setTemplates(data);
    } catch (err: any) {
      showToast('Failed to load templates: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setName('');
    setDescription('');
    setCategory('Bookkeeping');
    setRequirements([
      { name: 'Bank Statement', description: 'Full monthly statement in PDF.', required: true },
      { name: 'Credit Card Statement', description: 'Itemised card statement.', required: true },
      { name: 'Sales Invoices', description: 'PDF copies or sales export.', required: true },
      { name: 'Purchase Invoices & Receipts', description: 'All supplier bills.', required: true },
    ]);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (tmpl: Template) => {
    setEditingTemplate(tmpl);
    setName(tmpl.name);
    setDescription(tmpl.description);
    setCategory(tmpl.category);
    setRequirements(tmpl.requirements.map(r => ({
      name: r.name,
      description: r.description,
      required: r.required,
    })));
    setIsModalOpen(true);
  };

  const handleDuplicate = async (tmpl: Template) => {
    try {
      const dup = await api.duplicateTemplate(tmpl.id);
      showToast(`Duplicated "${dup.name}"`);
      loadTemplates();
    } catch (err: any) {
      showToast('Failed to duplicate: ' + err.message, 'error');
    }
  };

  const handleDelete = async (tmplId: string, tmplName: string) => {
    if (!confirm(`Delete template "${tmplName}"?`)) return;
    try {
      await api.deleteTemplate(tmplId);
      showToast(`Deleted template "${tmplName}"`);
      loadTemplates();
    } catch (err: any) {
      showToast('Failed to delete: ' + err.message, 'error');
    }
  };

  const handleAddRequirementRow = () => {
    setRequirements([...requirements, { name: '', description: '', required: true }]);
  };

  const handleRemoveRequirementRow = (index: number) => {
    setRequirements(requirements.filter((_, idx) => idx !== index));
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Template name is required', 'error');
      return;
    }
    const filtered = requirements.filter(r => r.name.trim().length > 0);
    if (filtered.length === 0) {
      showToast('Please add at least one document requirement to the checklist', 'error');
      return;
    }

    try {
      if (editingTemplate) {
        await api.updateTemplate(editingTemplate.id, {
          name: name.trim(),
          description: description.trim(),
          category,
          requirements: filtered,
        });
        showToast(`Template "${name}" updated`);
      } else {
        await api.createTemplate({
          name: name.trim(),
          description: description.trim(),
          category,
          requirements: filtered,
        });
        showToast(`Template "${name}" created`);
      }
      setIsModalOpen(false);
      loadTemplates();
    } catch (err: any) {
      showToast('Failed to save template: ' + err.message, 'error');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Request Templates</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Standardised document checklists for monthly bookkeeping, year-end accounts, VAT returns, and AML onboarding.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>New Template</span>
        </button>
      </div>

      {/* Grid of Templates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map(tmpl => (
          <div
            key={tmpl.id}
            className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5 flex flex-col justify-between hover:border-slate-300 transition-all"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  {tmpl.category}
                </span>
                <span className="text-xs font-mono tabular-nums text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                  {tmpl.requirements.length} documents
                </span>
              </div>

              <h2 className="text-base font-bold text-slate-900 mt-1">{tmpl.name}</h2>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">{tmpl.description}</p>

              {/* Requirements list */}
              <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5">
                {tmpl.requirements.slice(0, 4).map((r, idx) => (
                  <div key={idx} className="text-xs text-slate-700 flex items-center justify-between">
                    <span className="truncate pr-2 font-medium">{r.name}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {r.required ? 'Required' : 'Optional'}
                    </span>
                  </div>
                ))}
                {tmpl.requirements.length > 4 && (
                  <div className="text-[11px] text-slate-400 italic pt-1">
                    +{tmpl.requirements.length - 4} more requirements
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-end gap-2 text-xs">
              <button
                onClick={() => handleDuplicate(tmpl)}
                className="px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors inline-flex items-center gap-1"
                title="Duplicate template"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Duplicate</span>
              </button>
              <button
                onClick={() => handleOpenEdit(tmpl)}
                className="px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors inline-flex items-center gap-1"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
              <button
                onClick={() => handleDelete(tmpl.id, tmpl.name)}
                className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                title="Delete template"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-xl w-full my-8 max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <h2 className="text-base font-bold text-slate-900">
                {editingTemplate ? 'Edit Template' : 'New Request Template'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Template Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Monthly Bookkeeping"
                    className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="Bookkeeping">Bookkeeping</option>
                    <option value="Statutory Accounts">Statutory Accounts</option>
                    <option value="VAT">VAT</option>
                    <option value="Payroll">Payroll</option>
                    <option value="Onboarding">Onboarding & AML</option>
                    <option value="Tax Return">Self Assessment / Tax Return</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Explain when to use this template..."
                  className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-bold text-slate-900">Document Checklist Items</label>
                  <button
                    type="button"
                    onClick={handleAddRequirementRow}
                    className="text-[11px] font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded inline-flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Item</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {requirements.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={item.name}
                        onChange={e => {
                          const updated = [...requirements];
                          updated[idx].name = e.target.value;
                          setRequirements(updated);
                        }}
                        placeholder="Document name (e.g. Bank Statement)"
                        className="flex-1 text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                        required
                      />
                      <label className="flex items-center gap-1 text-[11px] text-slate-600 whitespace-nowrap cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.required}
                          onChange={e => {
                            const updated = [...requirements];
                            updated[idx].required = e.target.checked;
                            setRequirements(updated);
                          }}
                          className="rounded text-slate-900 focus:ring-slate-900"
                        />
                        <span>Req</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => handleRemoveRequirementRow(idx)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md shadow-xs"
                >
                  {editingTemplate ? 'Update Template' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
