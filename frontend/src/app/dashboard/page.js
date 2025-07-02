"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import DashboardLayout from "@/components/DashboardLayout";
import AuthGuard from "@/components/AuthGuard";
import USAMap from "@/components/USAMap";
import LeadsList from "@/components/LeadsList";
import ClientOnly from "@/components/ClientOnly";
import { leadService, smsService } from "@/services/leads";
import { API_URL, apiFetch } from "@/utils/api";
const API_BASE_URL = API_URL;
import Link from "next/link";
import {
  UsersIcon,
  ChatBubbleLeftRightIcon,
  CalendarDaysIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline";

export default function Dashboard() {
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [region, setRegion] = useState("");
  // Lead management stats
  const [leadStats, setLeadStats] = useState({
    total: 0,
    new: 0,
    contacted: 0,
    converted: 0,
  });
  // SMS stats
  const [smsStats, setSmsStats] = useState({
    totalMessages: 0,
    activeConversations: 0,
    responseRate: "0",
  });

  // Fetch SMS statistics
  const fetchSmsStats = async () => {
    try {
      const stats = await smsService.getStats();
      setSmsStats(stats);
    } catch (error) {
      console.error("Failed to fetch SMS stats:", error);
    }
  };

  const handleRegionSelect = async (region) => {
    setLoading(true);
    setSelectedRegion(region);

    try {
      // Ensure we're on the client side before accessing localStorage
      if (typeof window === "undefined") {
        setLeads([]);
        return;
      }

      const token = localStorage.getItem("token");

      // Fetch existing leads for this region using the new API
      const leadsResponse = await leadService.getLeadsByRegion(region.name);

      // Set leads (will be empty array if none found)
      setLeads(leadsResponse);
    } catch (error) {
      console.error("Failed to fetch leads:", error);
      setLeads([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch lead management statistics
  const fetchLeadStats = async () => {
    try {
      const response = await leadService.getLeads({ limit: 100000 }); // Get all leads for stats
      const regionRes = await apiFetch(`${API_BASE_URL}/api/auth/users/me`, {
        method: "GET",
      });
      const data = await regionRes.json();

      setRegion(data.user.region);

      const allLeads = response.leads || [];
      // Assuming user.region contains something like "CA,NY" or just "CA"
      const userStates = data.user.region
        ? data.user.region.split(",").map((s) => s.trim())
        : [];
      const defaultRegion = userStates.length > 0 && {
        name: userStates[0],
        state: userStates[0],
      };
      handleRegionSelect(defaultRegion);
      const userFilteredLeads = allLeads.filter((lead) => {
        if (!lead.region) return false;
        const leadState = lead.region.split(",").pop()?.trim(); // Get state part after last comma
        return userStates.includes(leadState);
      });
      setLeadStats({
        total: userFilteredLeads.length,
        new: userFilteredLeads.filter((lead) => lead.status === "NEW").length,
        contacted: userFilteredLeads.filter(
          (lead) => lead.status === "CONTACTED"
        ).length,
        converted: userFilteredLeads.filter(
          (lead) => lead.status === "CONVERTED"
        ).length,
      });
    } catch (error) {
      console.error("Failed to fetch lead stats:", error);
    }
  };
  // Load dashboard statistics on component mount
  useEffect(() => {
    fetchLeadStats();
    fetchSmsStats();
  }, []);

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="flex flex-col space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h1 className="text-2xl font-semibold text-gray-900 mb-4">
              Real Estate Leads Dashboard
            </h1>
            <p className="text-gray-600">
              Manage your leads, SMS conversations, and appointments all in one
              place.
            </p>
          </div>

          {/* Quick Stats Cards */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/leads" className="group">
              <div className="bg-blue-50 p-6 rounded-lg border-2 border-transparent group-hover:border-blue-200 transition-colors">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <UsersIcon className="h-8 w-8 text-blue-600" />
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-medium text-blue-900">
                      Total Leads
                    </h3>
                    <p className="text-3xl font-semibold text-blue-600">
                      {leadStats.total}
                    </p>
                  </div>
                </div>
              </div>
            </Link>

            <Link href="/leads?status=NEW" className="group">
              <div className="bg-yellow-50 p-6 rounded-lg border-2 border-transparent group-hover:border-yellow-200 transition-colors">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <ChartBarIcon className="h-8 w-8 text-yellow-600" />
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-medium text-yellow-900">
                      New Leads
                    </h3>
                    <p className="text-3xl font-semibold text-yellow-600">
                      {leadStats.new}
                    </p>
                  </div>
                </div>
              </div>
            </Link>

            <Link href="/sms" className="group">
              <div className="bg-green-50 p-6 rounded-lg border-2 border-transparent group-hover:border-green-200 transition-colors">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <ChatBubbleLeftRightIcon className="h-8 w-8 text-green-600" />
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-medium text-green-900">
                      SMS Conversations
                    </h3>
                    <p className="text-3xl font-semibold text-green-600">
                      {smsStats.activeConversations}
                    </p>
                  </div>
                </div>
              </div>
            </Link>

            <Link href="/leads?status=CONVERTED" className="group">
              <div className="bg-purple-50 p-6 rounded-lg border-2 border-transparent group-hover:border-purple-200 transition-colors">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <CalendarDaysIcon className="h-8 w-8 text-purple-600" />
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-medium text-purple-900">
                      Converted
                    </h3>
                    <p className="text-3xl font-semibold text-purple-600">
                      {leadStats.converted}
                    </p>
                  </div>
                </div>
              </div>
            </Link>
          </div>

          {/* Additional Stats Row */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Lead Conversion Rate
              </h3>
              <p className="text-2xl font-semibold text-blue-600">
                {leadStats.total > 0
                  ? Math.round((leadStats.converted / leadStats.total) * 100)
                  : 0}
                %
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {leadStats.converted} of {leadStats.total} leads converted
              </p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                SMS Response Rate
              </h3>
              <p className="text-2xl font-semibold text-green-600">
                {smsStats.responseRate}%
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {smsStats.totalMessages} total messages sent
              </p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Contacted Leads
              </h3>
              <p className="text-2xl font-semibold text-yellow-600">
                {leadStats.contacted}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Leads currently in contact process
              </p>
            </div>
          </div>

          <div className="flex gap-6">
            {/* Map Section (75%) */}
            <div className="flex-[3] bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                United States Map
              </h2>
              {/* Information Message */}
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                {region === "NO" ? (
                  <p className="text-sm text-blue-800">
                    <strong>Information:</strong> You don&apos;t have any
                    assigned region.
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-blue-800">
                      <strong>Information:</strong> You have been assigned to
                      these regions: <strong>{region}</strong>, which are
                      highlighted by{" "}
                      <span className="px-3 py-1 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2 border border-gray-300 bg-white hover:bg-gray-100 mx-1">
                        <span
                          className="w-3 h-3 inline-block rounded-full"
                          style={{ backgroundColor: "#A7C8F0" }}
                        ></span>
                        Region Color
                      </span>{" "}
                      on the map. Click on a region in the map to filter the
                      data.
                    </p>
                  </>
                )}
              </div>

              <ClientOnly
                fallback={
                  <div className="w-full h-[600px] rounded-lg overflow-hidden flex items-center justify-center bg-gray-100">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                }
              >
                <USAMap onRegionSelect={handleRegionSelect} region={region} />
              </ClientOnly>
            </div>

            {/* Leads Section (25%) */}
            <div className="flex-1 bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                {selectedRegion
                  ? `${
                      selectedRegion.name == "NO"
                        ? "No region assigned"
                        : "Zillow Leads in " + selectedRegion.name
                    }`
                  : "Select a Region"}
              </h2>
              <LeadsList leads={leads} loading={loading} />

              {/* Quick Actions */}
              <div className="mt-6 space-y-3">
                <Link
                  href="/leads/new"
                  className="block w-full bg-blue-600 text-white text-center py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Add Manual Lead
                </Link>
                <Link
                  href="/leads"
                  className="block w-full bg-gray-100 text-gray-700 text-center py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  View All Leads
                </Link>
                <Link
                  href="/sms"
                  className="block w-full bg-green-600 text-white text-center py-2 px-4 rounded-lg hover:bg-green-700 transition-colors"
                >
                  SMS Management
                </Link>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
