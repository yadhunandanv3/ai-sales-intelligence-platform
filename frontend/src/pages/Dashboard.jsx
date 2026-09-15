import React, { useEffect, useState } from 'react';
import { api } from '../services/api.js';

export default function Dashboard() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState(null);
  
  // View mode and pagination
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban' | 'table'
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [statusFilter, setStatusFilter] = useState('');
  
  // Modals / AI states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createData, setCreateData] = useState({ name: '', company: '', value: 0 });
  const [aiLoading, setAiLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [followUp, setFollowUp] = useState(null);
  const [tone, setTone] = useState('PROFESSIONAL');
  const [customInstructions, setCustomInstructions] = useState('');

  const fetchLeads = async () => {
    setLoading(true);
    try {
      if (viewMode === 'kanban') {
        const res = await api.getLeads({ search, status: statusFilter, limit: 100 });
        setLeads(res.data || []);
        if (res.pagination) setPagination(res.pagination);
      } else {
        const res = await api.getLeads({ search, status: statusFilter, page, limit });
        setLeads(res.data || []);
        if (res.pagination) setPagination(res.pagination);
      }
    } catch (err) {
      setError(err.message || 'Failed to load leads.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [search, statusFilter, page, limit, viewMode]);

  const handleCreateLead = async (e) => {
    e.preventDefault();
    try {
      await api.createLead(createData);
      setShowCreateModal(false);
      setCreateData({ name: '', company: '', value: 0 });
      fetchLeads();
    } catch (err) {
      alert(err.message || 'Failed to create lead');
    }
  };

  const handleStatusChange = async (leadId, newStatus) => {
    try {
      await api.updateLead(leadId, { status: newStatus });
      fetchLeads();
      if (selectedLead && selectedLead.id === leadId) {
        setSelectedLead({ ...selectedLead, status: newStatus });
      }
    } catch (err) {
      alert(err.message || 'Failed to update status');
    }
  };

  const handleDeleteLead = async (leadId) => {
    if (!window.confirm('Are you sure you want to delete this lead?')) return;
    try {
      await api.deleteLead(leadId);
      setSelectedLead(null);
      fetchLeads();
    } catch (err) {
      alert(err.message || 'Failed to delete lead');
    }
  };

  const handleAIScore = async (leadId) => {
    setAiLoading(true);
    try {
      const result = await api.scoreLead(leadId);
      alert(`AI Lead Score Updated! New Score: ${result.data.score}`);
      fetchLeads();
      if (selectedLead && selectedLead.id === leadId) {
        setSelectedLead({ ...selectedLead, score: result.data.score });
      }
    } catch (err) {
      alert(err.message || 'AI Scoring failed.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAISummary = async (leadId) => {
    setAiLoading(true);
    try {
      const result = await api.generateSummary(leadId);
      setSummary(result.data);
    } catch (err) {
      alert(err.message || 'Failed to compile AI summary.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAIFollowUp = async (leadId) => {
    setAiLoading(true);
    try {
      const result = await api.generateFollowUp(leadId, { tone, customInstructions });
      setFollowUp(result.data);
    } catch (err) {
      alert(err.message || 'Failed to compose AI follow-up.');
    } finally {
      setAiLoading(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 70) return 'bg-green-100 text-green-800';
    if (score >= 40) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  const stages = ['NEW', 'CONTACTED', 'QUALIFIED', 'LOST', 'WON'];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Filters & View Toggle Header */}
      <div className="mb-6 flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Search Input */}
          <div className="w-full sm:w-64">
            <input
              type="text"
              placeholder="Search by name, company..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Stage Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white text-gray-700 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">All Stages ({pagination.total})</option>
            {stages.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* View Mode Toggle */}
          <div className="inline-flex rounded-md shadow-sm border border-gray-300 overflow-hidden">
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 text-xs font-semibold ${
                viewMode === 'kanban' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              📊 Kanban Board
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 text-xs font-semibold border-l border-gray-300 ${
                viewMode === 'table' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              📋 Table View (Paginated)
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium shadow-sm transition"
          >
            + Add New Lead
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex-1 flex justify-center items-center py-20">
          <p className="text-gray-500 text-sm">Loading leads data...</p>
        </div>
      ) : viewMode === 'kanban' ? (
        /* Kanban Board View */
        <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => {
            const stageLeads = leads.filter((l) => l.status === stage);
            return (
              <div key={stage} className="flex flex-col bg-gray-100 rounded-lg p-4 min-w-[220px]">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold text-gray-700">{stage}</h3>
                  <span className="bg-gray-200 text-gray-700 text-xs px-2 py-0.5 rounded-full font-bold">
                    {stageLeads.length}
                  </span>
                </div>
                
                <div className="flex-1 space-y-3 overflow-y-auto">
                  {stageLeads.map((lead) => (
                    <div
                      key={lead.id}
                      onClick={() => {
                        setSelectedLead(lead);
                        setSummary(null);
                        setFollowUp(null);
                      }}
                      className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 hover:shadow-md cursor-pointer transition"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium text-gray-900 text-sm truncate">{lead.name}</h4>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${getScoreColor(lead.score)}`}>
                          ★ {lead.score}
                        </span>
                      </div>
                      <p className="text-gray-500 text-xs truncate mb-2">{lead.company || 'Private Person'}</p>
                      <div className="flex justify-between items-center text-xs font-bold text-gray-700">
                        <span>
                          {lead.value 
                            ? `$${parseFloat(lead.value).toLocaleString()}`
                            : '$0.00'}
                        </span>
                      </div>
                    </div>
                  ))}
                  {stageLeads.length === 0 && (
                    <p className="text-gray-400 text-xs text-center py-8">No leads</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Paginated Table View */
        <div className="flex-1 flex flex-col bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          <div className="flex-1 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prospect / Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stage</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deal Value</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">AI Score</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => {
                      setSelectedLead(lead);
                      setSummary(null);
                      setFollowUp(null);
                    }}
                    className="hover:bg-indigo-50/50 cursor-pointer transition"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">{lead.name}</div>
                      <div className="text-xs text-gray-500">{lead.jobTitle || lead.email || 'No title'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 font-medium">{lead.company || '—'}</div>
                      <div className="text-xs text-gray-500">{lead.source || 'Web'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2.5 py-1 text-xs font-semibold rounded-full ${
                        lead.status === 'WON' ? 'bg-green-100 text-green-800' :
                        lead.status === 'QUALIFIED' ? 'bg-blue-100 text-blue-800' :
                        lead.status === 'CONTACTED' ? 'bg-purple-100 text-purple-800' :
                        lead.status === 'NEW' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      ${parseFloat(lead.value || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${getScoreColor(lead.score)}`}>
                        ★ {lead.score}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                      {new Date(lead.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-xs font-medium">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLead(lead);
                          setSummary(null);
                          setFollowUp(null);
                        }}
                        className="text-indigo-600 hover:text-indigo-900 font-semibold"
                      >
                        Inspect & AI →
                      </button>
                    </td>
                  </tr>
                ))}
                {leads.length === 0 && (
                  <tr>
                    <td colSpan="7" className="px-6 py-10 text-center text-sm text-gray-500">
                      No leads found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls Bar */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3 text-xs text-gray-600">
              <span>
                Showing <span className="font-bold">{pagination.total > 0 ? (page - 1) * limit + 1 : 0}</span> to{' '}
                <span className="font-bold">{Math.min(page * limit, pagination.total)}</span> of{' '}
                <span className="font-bold">{pagination.total}</span> leads
              </span>
              <div className="flex items-center gap-1">
                <span>Per page:</span>
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  className="border border-gray-300 rounded px-2 py-0.5 text-xs bg-white text-gray-700"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Previous
              </button>
              
              {/* Numeric Page Buttons */}
              <div className="flex items-center gap-1">
                {Array.from({ length: pagination.totalPages || 1 }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold ${
                      page === p
                        ? 'bg-indigo-600 text-white'
                        : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= (pagination.totalPages || 1)}
                className="px-3 py-1 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details Sidepanel / Modal */}
      {selectedLead && (
        <div className="fixed inset-0 overflow-hidden z-50">
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setSelectedLead(null)} />
            
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <div className="pointer-events-auto w-screen max-w-2xl bg-white shadow-2xl flex flex-col h-full">
                {/* Header */}
                <div className="px-6 py-6 bg-indigo-700 text-white flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-bold">{selectedLead.name}</h2>
                    <p className="text-indigo-100 text-xs">{selectedLead.company || 'No Company'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleDeleteLead(selectedLead.id)}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded shadow transition"
                    >
                      Delete Lead
                    </button>
                    <button onClick={() => setSelectedLead(null)} className="text-white hover:text-indigo-200 text-lg font-bold">
                      ✕
                    </button>
                  </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* Status, Value, Score Block */}
                  <div className="grid grid-cols-3 gap-4 border-b border-gray-200 pb-6">
                    <div>
                      <span className="block text-xs text-gray-500 font-medium uppercase mb-1">Status</span>
                      <select
                        value={selectedLead.status}
                        onChange={(e) => handleStatusChange(selectedLead.id, e.target.value)}
                        className="block w-full border border-gray-300 rounded-md p-1 text-sm bg-white"
                      >
                        {stages.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-500 font-medium uppercase mb-1">Deal Value</span>
                      <span className="text-lg font-bold text-gray-900">
                        {selectedLead.value ? `$${parseFloat(selectedLead.value).toLocaleString()}` : '$0.00'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-500 font-medium uppercase mb-1">AI Lead Score</span>
                      <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${getScoreColor(selectedLead.score)}`}>
                        ★ {selectedLead.score} / 100
                      </span>
                    </div>
                  </div>

                  {/* AI Quick Actions */}
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 mb-3">AI intelligence Suite Actions</h3>
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => handleAIScore(selectedLead.id)}
                        disabled={aiLoading}
                        className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                      >
                        ⚡ Re-evaluate Score
                      </button>
                      <button
                        onClick={() => handleAISummary(selectedLead.id)}
                        disabled={aiLoading}
                        className="px-4 py-2 border border-indigo-300 rounded-md shadow-sm text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50"
                      >
                        📄 Compile Executive Brief
                      </button>
                    </div>
                  </div>

                  {/* AI Executive Summary Block */}
                  {summary && (
                    <div className="bg-indigo-50 rounded-lg p-5 border border-indigo-100 space-y-3">
                      <h4 className="text-sm font-bold text-indigo-900">📄 Executive Brief</h4>
                      <p className="text-indigo-800 text-sm leading-relaxed">{summary.summary}</p>
                      
                      {summary.keyPoints && summary.keyPoints.length > 0 && (
                        <div className="mt-3">
                          <h5 className="text-xs font-semibold text-indigo-900 uppercase tracking-wider mb-2">Key Takeaways:</h5>
                          <ul className="list-disc pl-4 space-y-1 text-indigo-800 text-xs">
                            {summary.keyPoints.map((kp, idx) => (
                              <li key={idx}>{kp}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* AI Follow-up Pitch Section */}
                  <div className="border-t border-gray-200 pt-6 space-y-4">
                    <h4 className="text-sm font-bold text-gray-900">✉️ AI Outreach Generator</h4>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 font-medium uppercase mb-1">Select Tone</label>
                        <select
                          value={tone}
                          onChange={(e) => setTone(e.target.value)}
                          className="block w-full border border-gray-300 rounded-md p-1.5 text-sm bg-white"
                        >
                          <option value="PROFESSIONAL">Professional</option>
                          <option value="CASUAL">Casual</option>
                          <option value="URGENT">Urgent</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 font-medium uppercase mb-1">Custom Instructions (Optional)</label>
                        <input
                          type="text"
                          value={customInstructions}
                          placeholder="e.g. mention meeting tomorrow"
                          onChange={(e) => setCustomInstructions(e.target.value)}
                          className="block w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => handleAIFollowUp(selectedLead.id)}
                      disabled={aiLoading}
                      className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-semibold shadow disabled:opacity-50"
                    >
                      🚀 Generate follow-up email draft
                    </button>

                    {followUp && (
                      <div className="bg-gray-50 border border-gray-200 rounded-md p-4 mt-4 space-y-2">
                        <div className="text-xs text-gray-500 font-medium">
                          Subject: <span className="text-gray-900 font-semibold">{followUp.subject}</span>
                        </div>
                        <div className="border-t border-gray-200 my-2 pt-2" />
                        <div className="text-xs text-gray-700 font-mono whitespace-pre-wrap leading-relaxed">
                          {followUp.body}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Lead Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex justify-center items-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Create New Lead</h3>
            
            <form onSubmit={handleCreateLead} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700">Lead Name</label>
                <input
                  type="text"
                  required
                  value={createData.name}
                  onChange={(e) => setCreateData({ ...createData, name: e.target.value })}
                  className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700">Company Name</label>
                <input
                  type="text"
                  value={createData.company}
                  onChange={(e) => setCreateData({ ...createData, company: e.target.value })}
                  className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700">Estimated Value ($)</label>
                <input
                  type="number"
                  required
                  value={createData.value}
                  onChange={(e) => setCreateData({ ...createData, value: parseFloat(e.target.value) })}
                  className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-gray-300 text-sm font-semibold rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-md hover:bg-indigo-700"
                >
                  Save Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
