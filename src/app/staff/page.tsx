"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GuideNudge } from "@/components/ui/guide-nudge";
import { StaffTable } from "@/components/staff/staff-table";
import { StaffFormDialog } from "@/components/staff/staff-form";
import { StaffDetailDialog } from "@/components/staff/staff-detail-dialog";
import { fetchJson } from "@/lib/fetch-json";

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  role: string;
  employmentType: string;
  fte: number;
  hireDate: string;
  icuCompetencyLevel: number;
  isChargeNurseQualified: boolean;
  certifications: string[];
  reliabilityRating: number;
  homeUnit: string | null;
  crossTrainedUnits: string[];
  weekendExempt: boolean;
  voluntaryFlexAvailable: boolean;
  isActive: boolean;
  notes: string | null;
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setStaff(await fetchJson<StaffMember[]>("/api/staff"));
    } catch {
      setLoadError(
        "Couldn't load the staff list. The server may be restarting — try again in a moment.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handleSave(data: any) {
    if (editingStaff) {
      await fetch(`/api/staff/${editingStaff.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } else {
      await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    }
    setDialogOpen(false);
    setEditingStaff(null);
    fetchStaff();
  }

  function handleEdit(id: string) {
    const member = staff.find((s) => s.id === id);
    if (member) {
      setEditingStaff(member);
      setDialogOpen(true);
    }
  }

  function handleAdd() {
    setEditingStaff(null);
    setDialogOpen(true);
  }

  function handleNameClick(staffMember: {
    id: string;
    firstName: string;
    lastName: string;
  }) {
    const fullStaff = staff.find((s) => s.id === staffMember.id);
    if (fullStaff) {
      setSelectedStaff(fullStaff);
      setDetailDialogOpen(true);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Staff Management</h1>
          <p className="mt-1 text-muted-foreground">
            {staff.length} staff members (
            {staff.filter((s) => s.isActive).length} active)
          </p>
        </div>
        <Button onClick={handleAdd}>Add Staff</Button>
      </div>

      <GuideNudge />

      <Card>
        <CardHeader>
          <CardTitle>Nursing Staff</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : loadError ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-destructive">{loadError}</p>
              <Button variant="outline" size="sm" onClick={fetchStaff}>
                Try again
              </Button>
            </div>
          ) : (
            <StaffTable
              staff={staff}
              onEdit={handleEdit}
              onNameClick={handleNameClick}
            />
          )}
        </CardContent>
      </Card>

      <StaffFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingStaff(null);
        }}
        initialData={
          editingStaff
            ? {
                id: editingStaff.id,
                firstName: editingStaff.firstName,
                lastName: editingStaff.lastName,
                email: editingStaff.email ?? "",
                phone: editingStaff.phone ?? "",
                role: editingStaff.role,
                employmentType: editingStaff.employmentType,
                fte: editingStaff.fte,
                hireDate: editingStaff.hireDate,
                icuCompetencyLevel: editingStaff.icuCompetencyLevel,
                isChargeNurseQualified: editingStaff.isChargeNurseQualified,
                reliabilityRating: editingStaff.reliabilityRating,
                homeUnit: editingStaff.homeUnit ?? "ICU",
                crossTrainedUnits: editingStaff.crossTrainedUnits ?? [],
                weekendExempt: editingStaff.weekendExempt ?? false,
                voluntaryFlexAvailable:
                  editingStaff.voluntaryFlexAvailable ?? false,
                isActive: editingStaff.isActive,
                notes: editingStaff.notes ?? "",
              }
            : undefined
        }
        onSave={handleSave}
      />

      <StaffDetailDialog
        open={detailDialogOpen}
        onClose={() => {
          setDetailDialogOpen(false);
          setSelectedStaff(null);
        }}
        staff={selectedStaff}
      />
    </div>
  );
}
