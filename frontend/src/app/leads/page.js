"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import AuthGuard from "@/components/AuthGuard";
import {
  leadService,
  LEAD_STATUSES,
  LEAD_PRIORITIES,
  LEAD_SOURCES,
} from "@/services/leads";
import {
  MagnifyingGlassIcon,
  PlusIcon,
  FunnelIcon,
  ChatBubbleLeftRightIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";

export default function LeadsPage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pagination, setPagination] = useState({});
  const [searchInput, setSearchInput] = useState(""); // Separate state for input

  // Filters
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    priority: "",
    source: "",
    page: 1,
    limit: 20,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  const [showFilters, setShowFilters] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchInput, page: 1 }));
    }, 500); // 500ms delay

    return () => clearTimeout(timeoutId);
  }, [searchInput]);

  // Memoized helper functions
  const getStatusColor = useCallback((status) => {
    const statusObj = LEAD_STATUSES.find((s) => s.value === status);
    return statusObj ? statusObj.color : "bg-gray-100 text-gray-800";
  }, []);

  const getPriorityColor = useCallback((priority) => {
    const priorityObj = LEAD_PRIORITIES.find((p) => p.value === priority);
    return priorityObj ? priorityObj.color : "bg-gray-100 text-gray-800";
  }, []);

  const formatDate = useCallback((dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString();
  }, []);

  // Fetch leads
  const fetchLeads = async () => {
    try {
      setLoading(true);
      const response = await leadService.getLeads(filters);
      setLeads(response.leads);
      setPagination(response.pagination);
    } catch (err) {
      setError("Failed to fetch leads");
      console.error("Error fetching leads:", err);
    } finally {
      setLoading(false);
    }
  };

  // Update filters
  const updateFilters = (newFilters) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
      // Only reset to page 1 if we're not specifically updating the page
      ...(newFilters.page === undefined && { page: 1 }),
    }));
  };

  // Update page specifically (for pagination)
  const updatePage = (newPage) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  };

  // Clear filters
  const clearFilters = () => {
    setSearchInput(""); // Clear search input
    setFilters({
      search: "",
      status: "",
      priority: "",
      source: "",
      page: 1,
      limit: 20,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  };

  // Load leads when filters change
  useEffect(() => {
    fetchLeads();
  }, [filters]);

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="p-6">
          {loading && leads.length === 0 ? (
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 rounded mb-4"></div>
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 bg-gray-200 rounded"></div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">
                      Lead Management
                    </h1>
                    <p className="text-gray-600">
                      Manage and track your real estate leads
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      📊 Showing Zillow scraped leads (visible to all users) and
                      your manually created leads
                    </p>
                  </div>
                  <Link
                    href="/leads/new"
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
                  >
                    <PlusIcon className="h-5 w-5" />
                    Add Lead
                  </Link>
                </div>
              </div>

              {/* Search and Filters */}
              <div className="bg-white rounded-lg shadow mb-6 p-4">
                <div className="flex flex-col lg:flex-row gap-4">
                  {/* Search with debouncing */}
                  <div className="flex-1">
                    <div className="relative">
                      <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search leads by address, ZIP code, or notes..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  {/* Filter Toggle */}
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    <FunnelIcon className="h-5 w-5" />
                    Filters
                  </button>
                </div>

                {/* Filter Options */}
                {showFilters && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {/* Status Filter */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Status
                        </label>
                        <select
                          value={filters.status}
                          onChange={(e) =>
                            updateFilters({ status: e.target.value })
                          }
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">All Statuses</option>
                          {LEAD_STATUSES.map((status) => (
                            <option key={status.value} value={status.value}>
                              {status.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Priority Filter */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Priority
                        </label>
                        <select
                          value={filters.priority}
                          onChange={(e) =>
                            updateFilters({ priority: e.target.value })
                          }
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">All Priorities</option>
                          {LEAD_PRIORITIES.map((priority) => (
                            <option key={priority.value} value={priority.value}>
                              {priority.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Source Filter */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Source
                        </label>
                        <select
                          value={filters.source}
                          onChange={(e) =>
                            updateFilters({ source: e.target.value })
                          }
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">All Sources</option>
                          {LEAD_SOURCES.map((source) => (
                            <option key={source.value} value={source.value}>
                              {source.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Clear Filters */}
                      <div className="flex items-end">
                        <button
                          onClick={clearFilters}
                          className="w-full px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                          Clear Filters
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                  {error}
                </div>
              )}

              {/* Leads Table */}
              <div className="bg-white rounded-lg shadow overflow-hidden">
                {leads.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-gray-400 text-xl mb-4">
                      No leads found
                    </div>
                    <p className="text-gray-600 mb-6">
                      {filters.search ||
                      filters.status ||
                      filters.priority ||
                      filters.source
                        ? "Try adjusting your filters or search terms"
                        : "Get started by adding your first lead"}
                    </p>
                    <Link
                      href="/leads/new"
                      className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
                    >
                      <PlusIcon className="h-5 w-5" />
                      Add Your First Lead
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Lead Info
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Phone
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Status
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Priority
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Source
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Last Contact
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {leads.map((lead) => (
                            <tr key={lead.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div>
                                  <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                                    {lead.address || `ZIP: ${lead.zipCode}`}
                                    {lead.source === "ZILLOW" && (
                                      <span
                                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                                        title="Scraped from Zillow"
                                      >
                                        🏠 Zillow
                                      </span>
                                    )}
                                    {lead.source === "MANUAL" && (
                                      <span
                                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800"
                                        title="Manually created"
                                      >
                                        ✍️ Manual
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    {lead.price && (
                                      <span className="mr-2">
                                        ${lead.price}
                                      </span>
                                    )}
                                    {lead.beds && <span>{lead.beds} beds</span>}
                                  </div>
                                  <div className="text-xs text-gray-400 mt-1">
                                    Created {formatDate(lead.createdAt)}
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {lead.contacts?.length > 0
                                  ? lead.contacts[0].phoneNumber
                                  : "No phone"}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                                    lead.status
                                  )}`}
                                >
                                  {LEAD_STATUSES.find(
                                    (s) => s.value === lead.status
                                  )?.label || lead.status}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(
                                    lead.priority
                                  )}`}
                                >
                                  {LEAD_PRIORITIES.find(
                                    (p) => p.value === lead.priority
                                  )?.label || lead.priority}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {LEAD_SOURCES.find(
                                  (s) => s.value === lead.source
                                )?.label || lead.source}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {formatDate(lead.lastContactDate)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <div className="flex items-center gap-2">
                                  <Link
                                    href={`/leads/${lead.id}`}
                                    className="text-blue-600 hover:text-blue-900 p-1"
                                    title="View Details"
                                  >
                                    <EyeIcon className="h-4 w-4" />
                                  </Link>
                                  {lead.smsConversations?.length > 0 && (
                                    <Link
                                      href={`/leads/${lead.id}?tab=sms`}
                                      className="text-green-600 hover:text-green-900 p-1"
                                      title="SMS Conversation"
                                    >
                                      <ChatBubbleLeftRightIcon className="h-4 w-4" />
                                    </Link>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {pagination.totalPages > 1 && (
                      <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                        <div className="flex-1 flex justify-between items-center">
                          <div className="text-sm text-gray-700">
                            Showing{" "}
                            {(pagination.page - 1) * pagination.limit + 1} to{" "}
                            {Math.min(
                              pagination.page * pagination.limit,
                              pagination.total
                            )}{" "}
                            of {pagination.total} results
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => updatePage(pagination.page - 1)}
                              disabled={pagination.page <= 1}
                              className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Previous
                            </button>
                            <span className="px-3 py-2 text-sm text-gray-700">
                              Page {pagination.page} of {pagination.totalPages}
                            </span>
                            <button
                              onClick={() => updatePage(pagination.page + 1)}
                              disabled={
                                pagination.page >= pagination.totalPages
                              }
                              className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
