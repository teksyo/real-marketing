"use client";

import { useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import AuthGuard from "@/components/AuthGuard";
import {
  MagnifyingGlassIcon,
  PlusIcon,
  FunnelIcon,
  PencilIcon,
  EyeIcon,
  XMarkIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { apiFetch, API_URL } from "@/utils/api";
import toast from "react-hot-toast";
import axios from "axios";

// Available regions list
const AVAILABLE_REGIONS = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
];

const USER_ROLES = [
  { value: "USER", label: "User" },
  { value: "ADMIN", label: "Admin" },
];

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pagination, setPagination] = useState({});
  const [searchInput, setSearchInput] = useState("");
  const [role, setRole] = useState("");
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await apiFetch(`${API_URL}/api/auth/users/me`);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const { user } = await res.json();
        setRole(user?.role ?? "");
      } catch (err) {
        console.error("Failed to get current user:", err);
        setError("Unable to verify user role");
      }
    };
    fetchUser();
  }, []);

  // Filters
  const [filters, setFilters] = useState({
    search: "",
    role: "",
    region: "",
    page: 1,
    limit: 20,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  const [showFilters, setShowFilters] = useState(false);

  // Modal states
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showEditRegionsModal, setShowEditRegionsModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // Form states
  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    role: "USER",
    phoneNumber: "",
    region: "",
  });

  const [editingRegions, setEditingRegions] = useState([]);
  const [showRegionDropdown, setShowRegionDropdown] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchInput, page: 1 }));
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchInput]);

  const formatDate = useCallback((dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString();
  }, []);

  const getRoleColor = useCallback((role) => {
    switch (role) {
      case "ADMIN":
        return "bg-purple-100 text-purple-800";
      case "USER":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  }, []);

  // Fetch users
  const fetchUsers = async () => {
    try {
      setLoading(true);

      const response = await apiFetch(`${API_URL}/api/auth/users`);
      if (!response.ok) {
        throw new Error(`Status ${response.status}`);
      }
      const data = await response.json();
      // Apply client-side filtering since the API might not support all filters
      let filteredUsers = data.users || data || [];

      if (filters.search) {
        filteredUsers = filteredUsers.filter(
          (user) =>
            user.email.toLowerCase().includes(filters.search.toLowerCase()) ||
            (user.region &&
              user.region.toLowerCase().includes(filters.search.toLowerCase()))
        );
      }

      if (filters.role) {
        filteredUsers = filteredUsers.filter(
          (user) => user.role === filters.role
        );
      }

      if (filters.region) {
        filteredUsers = filteredUsers.filter(
          (user) => user.region && user.region.includes(filters.region)
        );
      }

      setUsers(filteredUsers);
      setPagination({
        page: 1,
        totalPages: 1,
        total: filteredUsers.length,
        limit: 20,
      });
    } catch (err) {
      setError("Failed to fetch users");
      console.error("Error fetching users:", err);
    } finally {
      setLoading(false);
    }
  };

  // Add new user
  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      const response = await apiFetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        body: JSON.stringify(newUser),
      });
      if (response.ok) {
        toast.success("User created successfully!");
        fetchUsers();
        setShowAddUserModal(false);
        setNewUser({ email: "", password: "", role: "USER", phoneNumber: "" });
        fetchUsers(); // Refresh the list
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || "Failed to add user");
      }
    } catch (err) {
      setError(
        err?.response?.data?.message || err?.message || "Failed to add user"
      );
      console.error("Error adding user:", err);
    }
  };

  // Update user regions
  const handleUpdateRegions = async (e) => {
    e.preventDefault();
    try {
      const regionsString =
        editingRegions.length > 0 ? editingRegions.join(",") : "";

      const response = await apiFetch(
        `${API_URL}/api/auth/users/${selectedUser.id}`,
        {
          method: "PUT",
          body: JSON.stringify({ region: regionsString }),
        }
      );

      if (response.ok) {
        const { updatedUser } = await response.json(); // optional use
        setShowEditRegionsModal(false);
        setSelectedUser(null);
        setEditingRegions([]);
        fetchUsers(); // Refresh the list of users
      } else {
        const errorData = await response.json();
        setError(errorData.message || "Failed to update regions");
      }
    } catch (err) {
      setError("Failed to update regions");
      console.error("Error updating regions:", err);
    }
  };

  // Open edit regions modal
  const openEditRegionsModal = (user) => {
    setSelectedUser(user);
    const userRegions =
      user.region && user.region !== "ALL"
        ? user.region.split(",").map((r) => r.trim())
        : [];
    setEditingRegions(userRegions);
    setShowEditRegionsModal(true);
  };
  const [selectedDelUser, setSelectedUserDel] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const confirmDeleteUser = (user) => {
    setSelectedUserDel(user);
    setShowDeleteModal(true);
  };
  const handleDeleteConfirmed = async () => {
    if (!selectedDelUser) return;

    try {
      const response = await apiFetch(
        `${API_URL}/api/auth/users/${selectedDelUser.id}`,
        {
          method: "DELETE",
        }
      );

      if (response.ok) {
        toast.success("User deleted successfully");
        fetchUsers();
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || "Failed to delete user");
      }
    } catch (error) {
      console.error("Delete failed:", error);
      toast.error("Something went wrong while deleting");
    } finally {
      setShowDeleteModal(false);
      setSelectedUserDel(null);
    }
  };

  // Handle region selection
  const toggleRegion = (region) => {
    setEditingRegions((prev) => {
      if (prev.includes(region)) {
        return prev.filter((r) => r !== region);
      } else {
        return [...prev, region];
      }
    });
  };

  // Select all regions
  const selectAllRegions = () => {
    setEditingRegions([...AVAILABLE_REGIONS]);
  };

  // Clear all regions
  const clearAllRegions = () => {
    setEditingRegions([]);
  };

  // Update filters
  const updateFilters = (newFilters) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
      ...(newFilters.page === undefined && { page: 1 }),
    }));
  };

  // Clear filters
  const clearFilters = () => {
    setSearchInput("");
    setFilters({
      search: "",
      role: "",
      region: "",
      page: 1,
      limit: 20,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  };

  // Load users when filters change
  useEffect(() => {
    fetchUsers();
  }, [filters]);

  return (
    <AuthGuard>
      <DashboardLayout>
        {role && role === "ADMIN" ? (
          <>
            <div className="p-6">
              {loading && users.length === 0 ? (
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
                          Admin Panel - Users
                        </h1>
                        <p className="text-gray-600">
                          Manage users and assign regions
                        </p>
                      </div>
                      <button
                        onClick={() => setShowAddUserModal(true)}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
                      >
                        <PlusIcon className="h-5 w-5" />
                        Add User
                      </button>
                    </div>
                  </div>

                  {/* Search and Filters */}
                  <div className="bg-white rounded-lg shadow mb-6 p-4">
                    <div className="flex flex-col lg:flex-row gap-4">
                      <div className="flex-1">
                        <div className="relative">
                          <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                          <input
                            type="text"
                            placeholder="Search users by email or region..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </div>

                      <button
                        onClick={() => setShowFilters(!showFilters)}
                        className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        <FunnelIcon className="h-5 w-5" />
                        Filters
                      </button>
                    </div>

                    {showFilters && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Role
                            </label>
                            <select
                              value={filters.role}
                              onChange={(e) =>
                                updateFilters({ role: e.target.value })
                              }
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">All Roles</option>
                              {USER_ROLES.map((role) => (
                                <option key={role.value} value={role.value}>
                                  {role.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Region
                            </label>
                            <select
                              value={filters.region}
                              onChange={(e) =>
                                updateFilters({ region: e.target.value })
                              }
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">All Regions</option>
                              {AVAILABLE_REGIONS.map((region) => (
                                <option key={region} value={region}>
                                  {region}
                                </option>
                              ))}
                            </select>
                          </div>

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

                  {/* Users Table */}
                  <div className="bg-white rounded-lg shadow overflow-hidden">
                    {users.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="text-gray-400 text-xl mb-4">
                          No users found
                        </div>
                        <p className="text-gray-600 mb-6">
                          {filters.search || filters.role || filters.region
                            ? "Try adjusting your filters or search terms"
                            : "Get started by adding your first user"}
                        </p>
                        <button
                          onClick={() => setShowAddUserModal(true)}
                          className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
                        >
                          <PlusIcon className="h-5 w-5" />
                          Add Your First User
                        </button>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                User Info
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Role
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Regions
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Phone
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Created
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {users.map((user) => (
                              <tr key={user.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div>
                                    <div className="text-sm font-medium text-gray-900">
                                      {user.email}
                                    </div>
                                    <div className="text-xs text-gray-400">
                                      ID: {user.id}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span
                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColor(
                                      user.role
                                    )}`}
                                  >
                                    {user.role}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="text-sm text-gray-900 max-w-xs">
                                    {user.region === "ALL" ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                        ALL REGIONS
                                      </span>
                                    ) : user.region ? (
                                      <div className="flex flex-wrap gap-1">
                                        {user.region
                                          .split(",")
                                          .map((region, index) => (
                                            <span
                                              key={index}
                                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800"
                                            >
                                              {region.trim()}
                                            </span>
                                          ))}
                                      </div>
                                    ) : (
                                      <span className="text-gray-400">
                                        No regions assigned
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                  {user.phoneNumber || "N/A"}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {formatDate(user.createdAt)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => openEditRegionsModal(user)}
                                      className="text-blue-600 hover:text-blue-900 p-1"
                                      title="Edit Regions"
                                    >
                                      <PencilIcon className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={() => confirmDeleteUser(user)}
                                      className="text-blue-600 hover:text-blue-900 p-1"
                                      title="Delete User"
                                    >
                                      <TrashIcon
                                        className="h-4 w-4"
                                        color="red"
                                      />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Add User Modal */}
            {showAddUserModal && (
              <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium text-gray-900">
                      Add New User
                    </h3>
                    <button
                      onClick={() => setShowAddUserModal(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <XMarkIcon className="h-6 w-6" />
                    </button>
                  </div>

                  <form onSubmit={handleAddUser}>
                    {/* Error Message */}
                    {error && (
                      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                        {error}
                        <button
                          onClick={() => setError("")}
                          className="float-right text-red-500 hover:text-red-700"
                        >
                          ×
                        </button>
                      </div>
                    )}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email *
                      </label>
                      <input
                        type="email"
                        required
                        value={newUser.email}
                        onChange={(e) =>
                          setNewUser({ ...newUser, email: e.target.value })
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Password *
                      </label>
                      <input
                        type="password"
                        required
                        value={newUser.password}
                        onChange={(e) =>
                          setNewUser({ ...newUser, password: e.target.value })
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Role
                      </label>
                      <select
                        value={newUser.role}
                        onChange={(e) =>
                          setNewUser({ ...newUser, role: e.target.value })
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      >
                        {USER_ROLES.map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        value={newUser.phoneNumber}
                        onChange={(e) =>
                          setNewUser({
                            ...newUser,
                            phoneNumber: e.target.value,
                          })
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setShowAddUserModal(false)}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        Add User
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Edit Regions Modal */}
            {showEditRegionsModal && selectedUser && (
              <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                <div className="relative top-10 mx-auto p-5 border w-[500px] shadow-lg rounded-md bg-white max-h-[90vh] overflow-y-auto">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium text-gray-900">
                      Edit Regions for {selectedUser.email}
                    </h3>
                    <button
                      onClick={() => setShowEditRegionsModal(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <XMarkIcon className="h-6 w-6" />
                    </button>
                  </div>

                  <form onSubmit={handleUpdateRegions}>
                    {error && (
                      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                        {error}
                        <button
                          onClick={() => setError("")}
                          className="float-right text-red-500 hover:text-red-700"
                        >
                          ×
                        </button>
                      </div>
                    )}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Assigned Regions ({editingRegions.length} selected)
                      </label>

                      {/* Control buttons */}
                      <div className="flex gap-2 mb-3">
                        <button
                          type="button"
                          onClick={selectAllRegions}
                          className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={clearAllRegions}
                          className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                        >
                          Clear All
                        </button>
                      </div>

                      {/* Selected regions display */}
                      {editingRegions.length > 0 && (
                        <div className="mb-3 p-2 border rounded-lg bg-gray-50">
                          <div className="text-xs text-gray-600 mb-1">
                            Selected regions:
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {editingRegions.map((region) => (
                              <span
                                key={region}
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                              >
                                {region}
                                <button
                                  type="button"
                                  onClick={() => toggleRegion(region)}
                                  className="ml-1 text-blue-600 hover:text-blue-800"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Regions grid */}
                      <div className="border rounded-lg p-3 max-h-60 overflow-y-auto">
                        <div className="grid grid-cols-4 gap-2">
                          {AVAILABLE_REGIONS.map((region) => (
                            <label
                              key={region}
                              className={`flex items-center p-2 rounded cursor-pointer text-sm ${
                                editingRegions.includes(region)
                                  ? "bg-blue-100 text-blue-900 border border-blue-300"
                                  : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={editingRegions.includes(region)}
                                onChange={() => toggleRegion(region)}
                                className="mr-2 h-3 w-3 text-blue-600"
                              />
                              {region}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setShowEditRegionsModal(false)}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        Update Regions ({editingRegions.length})
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
            {showDeleteModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                <div className="bg-white p-6 rounded shadow-md w-96 text-center">
                  <h2 className="text-lg font-semibold mb-4">Confirm Delete</h2>
                  <p>
                    Are you sure you want to delete{" "}
                    <strong>{selectedDelUser?.email}</strong>?
                  </p>
                  <div className="mt-6 flex justify-center space-x-4">
                    <button
                      onClick={handleDeleteConfirmed}
                      className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                    >
                      Yes, Delete
                    </button>
                    <button
                      onClick={() => setShowDeleteModal(false)}
                      className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-[80vh]">
            <div className="text-center">You are not an Admin User</div>
          </div>
        )}
      </DashboardLayout>
    </AuthGuard>
  );
}
