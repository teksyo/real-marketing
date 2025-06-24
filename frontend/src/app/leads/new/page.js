"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import AuthGuard from "@/components/AuthGuard";
import { leadService, LEAD_PRIORITIES, LEAD_SOURCES } from "@/services/leads";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import Link from "next/link";

export default function NewLeadPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const stateAbbreviations = {
    Florida: "FL",
    Georgia: "GA",
    Louisiana: "LA",
  };

  const [formData, setFormData] = useState({
    address: "",
    price: "",
    beds: "",
    zipCode: "",
    phoneNumber: "",
    priority: "MEDIUM",
    source: "MANUAL",
    notes: "",
    nextFollowUpDate: "",
    region: "",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.zipCode.trim()) {
      setError("ZIP code is required");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const leadData = {
        ...formData,
        region: formData.region || null,
        price: formData.price || null,
        beds: formData.beds || null,
        notes: formData.notes || null,
        nextFollowUpDate: formData.nextFollowUpDate || null,
      };

      await leadService.createLead(leadData);
      router.push("/leads");
    } catch (err) {
      setError(err.message || "Failed to create lead");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear error when user starts typing
    if (error) setError("");
  };

  const formatDateForInput = (date) => {
    if (!date) return "";
    return new Date(date).toISOString().split("T")[0];
  };

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="p-6 max-w-2xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-4 mb-4">
              <Link
                href="/leads"
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
              >
                <ArrowLeftIcon className="h-5 w-5" />
                Back to Leads
              </Link>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Add New Lead</h1>
            <p className="text-gray-600">Create a new lead manually</p>
          </div>

          {/* Form */}
          <div className="bg-white rounded-lg shadow p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              )}

              {/* Property Information */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Property Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Address */}
                  <div className="md:col-span-2">
                    <label
                      htmlFor="address"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Property Address
                    </label>
                    <input
                      type="text"
                      id="address"
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      placeholder="123 Main St, City, State"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* ZIP Code */}
                  <div>
                    <label
                      htmlFor="zipCode"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      ZIP Code <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="zipCode"
                      name="zipCode"
                      value={formData.zipCode}
                      onChange={handleChange}
                      placeholder="12345"
                      required
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* Price */}
                  <div>
                    <label
                      htmlFor="price"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Price
                    </label>
                    <input
                      type="text"
                      id="price"
                      name="price"
                      value={formData.price}
                      onChange={handleChange}
                      placeholder="500000"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* Beds */}
                  <div>
                    <label
                      htmlFor="beds"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Bedrooms
                    </label>
                    <input
                      type="text"
                      id="beds"
                      name="beds"
                      value={formData.beds}
                      onChange={handleChange}
                      placeholder="3"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* Phone Number */}
                  <div>
                    <label
                      htmlFor="phoneNumber"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Phone Number
                    </label>
                    <input
                      type="text"
                      id="phoneNumber"
                      name="phoneNumber"
                      value={formData.phoneNumber}
                      onChange={handleChange}
                      placeholder="123-456-7890"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Lead Classification */}

              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Lead Classification
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Priority */}
                  <div>
                    <label
                      htmlFor="priority"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Priority
                    </label>
                    <select
                      id="priority"
                      name="priority"
                      value={formData.priority}
                      onChange={handleChange}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {LEAD_PRIORITIES.map((priority) => (
                        <option key={priority.value} value={priority.value}>
                          {priority.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Source */}
                  <div>
                    <label
                      htmlFor="source"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Lead Source
                    </label>
                    <select
                      id="source"
                      name="source"
                      value={formData.source}
                      onChange={handleChange}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {LEAD_SOURCES.map((source) => (
                        <option key={source.value} value={source.value}>
                          {source.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Region */}
                  <div>
                    <label
                      htmlFor="region"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Region
                    </label>
                    <select
                      id="region"
                      name="region"
                      required
                      value={formData.region}
                      onChange={handleChange}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select a state...</option>
                      {Object.entries(stateAbbreviations).map(
                        ([stateName, abbreviation]) => (
                          <option
                            key={stateName}
                            value={`${stateName}, ${abbreviation}`}
                          >
                            {stateName}, {abbreviation}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                </div>
              </div>

              {/* Follow-up and Notes */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Additional Information
                </h3>
                <div className="space-y-4">
                  {/* Next Follow-up Date */}
                  <div>
                    <label
                      htmlFor="nextFollowUpDate"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Next Follow-up Date
                    </label>
                    <input
                      type="date"
                      id="nextFollowUpDate"
                      name="nextFollowUpDate"
                      value={formData.nextFollowUpDate}
                      onChange={handleChange}
                      min={new Date().toISOString().split("T")[0]}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label
                      htmlFor="notes"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Notes
                    </label>
                    <textarea
                      id="notes"
                      name="notes"
                      value={formData.notes}
                      onChange={handleChange}
                      rows={4}
                      placeholder="Any additional information about this lead..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex justify-end gap-4 pt-4 border-t border-gray-200">
                <Link
                  href="/leads"
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Creating...
                    </>
                  ) : (
                    "Create Lead"
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Help Text */}
          <div className="mt-6 text-sm text-gray-600">
            <h4 className="font-medium mb-2">Tips for adding leads:</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>ZIP code is required for regional tracking</li>
              <li>Set priority based on lead quality and urgency</li>
              <li>Schedule follow-ups to maintain engagement</li>
              <li>Add detailed notes to track lead context</li>
            </ul>
          </div>
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
