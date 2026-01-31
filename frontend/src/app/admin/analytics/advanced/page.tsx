/**
 * Advanced Analytics Page
 *
 * Interactive analytics dashboard with:
 * - Drill-down charts (click to filter)
 * - Time range picker
 * - Custom report builder
 * - Export capabilities
 *
 * @version 1.0.0
 * @date 2026-01-29
 */

'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Calendar,
  Download,
  Filter,
  BarChart3,
  PieChart as PieChartIcon,
  TrendingUp,
  Users,
  Shield,
  Globe,
  ChevronDown,
  X,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { notify } from '@/lib/notification-service';

// ============================================
// Types
// ============================================

type TimeRange = '24h' | '7d' | '30d' | '90d' | 'custom';
type ChartType = 'bar' | 'line' | 'pie' | 'area';
type MetricType = 'decisions' | 'resources' | 'users' | 'denials' | 'clearance' | 'country' | 'coi';

interface DrillDownFilter {
  type: MetricType;
  value: string;
  label: string;
}

interface AnalyticsData {
  timestamp?: string;
  date?: string;
  label: string;
  value: number;
  [key: string]: any;
}

// ============================================
// Main Component
// ============================================

export default function AdvancedAnalyticsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('decisions');
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [drillDownFilters, setDrillDownFilters] = useState<DrillDownFilter[]>([]);
  const [showReportBuilder, setShowReportBuilder] = useState(false);

  // Mock data - would come from API in production
  const analyticsData = useMemo(() => generateMockData(selectedMetric, timeRange, drillDownFilters), [
    selectedMetric,
    timeRange,
    drillDownFilters,
  ]);

  const handleDrillDown = (metric: MetricType, value: string, label: string) => {
    const newFilter: DrillDownFilter = { type: metric, value, label };
    setDrillDownFilters((prev) => [...prev, newFilter]);
    notify.toast.success(`Filtered by ${label}`);
  };

  const removeDrillDownFilter = (index: number) => {
    setDrillDownFilters((prev) => prev.filter((_, i) => i !== index));
  };

  const exportData = (format: 'csv' | 'json' | 'pdf') => {
    notify.toast.success(`Exporting as ${format.toUpperCase()}...`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `analytics-${selectedMetric}-${timeRange}-${timestamp}`;

    if (format === 'json') {
      const blob = new Blob(
        [JSON.stringify({ metric: selectedMetric, timeRange, filters: drillDownFilters, data: analyticsData }, null, 2)],
        { type: 'application/json' }
      );
      triggerDownload(blob, `${filename}.json`);
    } else if (format === 'csv') {
      const headers = Object.keys(analyticsData[0] || { label: '', value: '' });
      const csvRows = [
        headers.join(','),
        ...analyticsData.map((row: AnalyticsData) =>
          headers.map((h) => {
            const val = row[h];
            const str = String(val ?? '');
            return str.includes(',') || str.includes('"') || str.includes('\n')
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          }).join(',')
        ),
      ];
      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
      triggerDownload(blob, `${filename}.csv`);
    } else if (format === 'pdf') {
      // Generate a printable HTML report and trigger print-to-PDF
      const htmlContent = `
        <!DOCTYPE html>
        <html><head><title>Analytics Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; color: #111; }
          h1 { font-size: 24px; margin-bottom: 4px; }
          .meta { color: #666; font-size: 12px; margin-bottom: 24px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; font-size: 13px; }
          th { background: #f3f4f6; font-weight: 600; }
          tr:nth-child(even) { background: #f9fafb; }
        </style></head><body>
        <h1>Analytics Report: ${selectedMetric}</h1>
        <div class="meta">Time Range: ${timeRange} | Generated: ${new Date().toLocaleString()} | Filters: ${drillDownFilters.length || 'None'}</div>
        <table>
          <thead><tr>${Object.keys(analyticsData[0] || {}).map((h) => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${analyticsData.map((row: AnalyticsData) =>
            `<tr>${Object.values(row).map((v) => `<td>${String(v ?? '')}</td>`).join('')}</tr>`
          ).join('')}</tbody>
        </table>
        </body></html>`;
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.print();
      }
    }
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Advanced Analytics
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Interactive analytics with drill-down and custom reporting
          </p>
        </div>

        {/* Controls Bar */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            {/* Time Range Selector */}
            <TimeRangeSelector
              timeRange={timeRange}
              onTimeRangeChange={setTimeRange}
              customStartDate={customStartDate}
              customEndDate={customEndDate}
              onCustomStartChange={setCustomStartDate}
              onCustomEndChange={setCustomEndDate}
            />

            {/* Metric Selector */}
            <MetricSelector selectedMetric={selectedMetric} onMetricChange={setSelectedMetric} />

            {/* Chart Type Selector */}
            <ChartTypeSelector chartType={chartType} onChartTypeChange={setChartType} />

            {/* Export Button */}
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => setShowReportBuilder(!showReportBuilder)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Filter className="w-4 h-4" />
                Report Builder
              </button>
              <ExportButton onExport={exportData} />
            </div>
          </div>

          {/* Drill-Down Filters */}
          {drillDownFilters.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Active Filters:
                </span>
                {drillDownFilters.map((filter, index) => (
                  <button
                    key={index}
                    onClick={() => removeDrillDownFilter(index)}
                    className="cursor-pointer"
                  >
                    <Badge variant="primary" className="flex items-center gap-1">
                      {filter.label}
                      <X className="w-3 h-3" />
                    </Badge>
                  </button>
                ))}
                <button
                  onClick={() => setDrillDownFilters([])}
                  className="text-sm text-red-600 hover:text-red-700 dark:text-red-400"
                >
                  Clear All
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Main Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            {getMetricLabel(selectedMetric)} Over Time
          </h2>
          <InteractiveChart
            data={analyticsData}
            chartType={chartType}
            selectedMetric={selectedMetric}
            onDrillDown={handleDrillDown}
          />
        </div>

        {/* Report Builder Modal */}
        {showReportBuilder && (
          <ReportBuilderModal
            onClose={() => setShowReportBuilder(false)}
            onGenerate={(config) => {
              notify.toast.success('Generating custom report...');
              setShowReportBuilder(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

// ============================================
// Time Range Selector
// ============================================

function TimeRangeSelector({
  timeRange,
  onTimeRangeChange,
  customStartDate,
  customEndDate,
  onCustomStartChange,
  onCustomEndChange,
}: {
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  customStartDate: string;
  customEndDate: string;
  onCustomStartChange: (date: string) => void;
  onCustomEndChange: (date: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Calendar className="w-4 h-4 text-gray-500" />
      <select
        value={timeRange}
        onChange={(e) => onTimeRangeChange(e.target.value as TimeRange)}
        className="px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
      >
        <option value="24h">Last 24 Hours</option>
        <option value="7d">Last 7 Days</option>
        <option value="30d">Last 30 Days</option>
        <option value="90d">Last 90 Days</option>
        <option value="custom">Custom Range</option>
      </select>
      
      {timeRange === 'custom' && (
        <>
          <input
            type="date"
            value={customStartDate}
            onChange={(e) => onCustomStartChange(e.target.value)}
            className="px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
          />
          <span className="text-gray-500">to</span>
          <input
            type="date"
            value={customEndDate}
            onChange={(e) => onCustomEndChange(e.target.value)}
            className="px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
          />
        </>
      )}
    </div>
  );
}

// ============================================
// Metric Selector
// ============================================

function MetricSelector({
  selectedMetric,
  onMetricChange,
}: {
  selectedMetric: MetricType;
  onMetricChange: (metric: MetricType) => void;
}) {
  const metrics: { value: MetricType; label: string; icon: any }[] = [
    { value: 'decisions', label: 'Authorization Decisions', icon: Shield },
    { value: 'resources', label: 'Resource Access', icon: BarChart3 },
    { value: 'users', label: 'User Activity', icon: Users },
    { value: 'denials', label: 'Access Denials', icon: X },
    { value: 'clearance', label: 'By Clearance', icon: Shield },
    { value: 'country', label: 'By Country', icon: Globe },
  ];

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Metric:</span>
      <select
        value={selectedMetric}
        onChange={(e) => onMetricChange(e.target.value as MetricType)}
        className="px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
      >
        {metrics.map((metric) => (
          <option key={metric.value} value={metric.value}>
            {metric.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ============================================
// Chart Type Selector
// ============================================

function ChartTypeSelector({
  chartType,
  onChartTypeChange,
}: {
  chartType: ChartType;
  onChartTypeChange: (type: ChartType) => void;
}) {
  const types: { value: ChartType; label: string; icon: any }[] = [
    { value: 'bar', label: 'Bar', icon: BarChart3 },
    { value: 'line', label: 'Line', icon: TrendingUp },
    { value: 'area', label: 'Area', icon: BarChart3 },
    { value: 'pie', label: 'Pie', icon: PieChartIcon },
  ];

  return (
    <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
      {types.map((type) => {
        const Icon = type.icon;
        return (
          <button
            key={type.value}
            onClick={() => onChartTypeChange(type.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              chartType === type.value
                ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <Icon className="w-4 h-4" />
          </button>
        );
      })}
    </div>
  );
}

// ============================================
// Interactive Chart
// ============================================

function InteractiveChart({
  data,
  chartType,
  selectedMetric,
  onDrillDown,
}: {
  data: AnalyticsData[];
  chartType: ChartType;
  selectedMetric: MetricType;
  onDrillDown: (metric: MetricType, value: string, label: string) => void;
}) {
  const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444'];

  const handleClick = (entry: any) => {
    if (entry && entry.label) {
      onDrillDown(selectedMetric, entry.label, entry.label);
    }
  };

  if (chartType === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={400}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            outerRadius={120}
            label={(entry: any) => `${entry.name}: ${entry.value}`}
            onClick={handleClick}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} className="cursor-pointer" />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-300 dark:stroke-gray-600" />
          <XAxis dataKey="label" className="text-gray-600 dark:text-gray-400" />
          <YAxis className="text-gray-600 dark:text-gray-400" />
          <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
          <Legend />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#6366f1"
            strokeWidth={2}
            dot={{ r: 4, className: 'cursor-pointer' }}
            onClick={handleClick}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'area') {
    return (
      <ResponsiveContainer width="100%" height={400}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-300 dark:stroke-gray-600" />
          <XAxis dataKey="label" className="text-gray-600 dark:text-gray-400" />
          <YAxis className="text-gray-600 dark:text-gray-400" />
          <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
          <Legend />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#6366f1"
            fill="#6366f1"
            fillOpacity={0.3}
            onClick={handleClick}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  // Default: bar chart
  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-gray-300 dark:stroke-gray-600" />
        <XAxis dataKey="label" className="text-gray-600 dark:text-gray-400" />
        <YAxis className="text-gray-600 dark:text-gray-400" />
        <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
        <Legend />
        <Bar dataKey="value" fill="#6366f1" onClick={handleClick} className="cursor-pointer" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ============================================
// Export Button
// ============================================

function ExportButton({ onExport }: { onExport: (format: 'csv' | 'json' | 'pdf') => void }) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
      >
        <Download className="w-4 h-4" />
        Export
        <ChevronDown className="w-4 h-4" />
      </button>

      {showMenu && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute right-0 mt-2 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-10"
        >
          <button
            onClick={() => {
              onExport('csv');
              setShowMenu(false);
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Export as CSV
          </button>
          <button
            onClick={() => {
              onExport('json');
              setShowMenu(false);
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Export as JSON
          </button>
          <button
            onClick={() => {
              onExport('pdf');
              setShowMenu(false);
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Export as PDF
          </button>
        </motion.div>
      )}
    </div>
  );
}

// ============================================
// Report Builder Modal
// ============================================

function ReportBuilderModal({
  onClose,
  onGenerate,
}: {
  onClose: () => void;
  onGenerate: (config: any) => void;
}) {
  const [selectedMetrics, setSelectedMetrics] = useState<MetricType[]>(['decisions']);
  const [scheduleFrequency, setScheduleFrequency] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-2xl w-full p-6 m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Custom Report Builder</h3>

        <div className="space-y-4 mb-6">
          {/* Metrics Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Metrics
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['decisions', 'resources', 'users', 'denials', 'clearance', 'country'] as MetricType[]).map((metric) => (
                <label key={metric} className="flex items-center gap-2 p-2 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMetrics.includes(metric)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedMetrics([...selectedMetrics, metric]);
                      } else {
                        setSelectedMetrics(selectedMetrics.filter((m) => m !== metric));
                      }
                    }}
                    className="rounded"
                  />
                  <span className="text-sm">{getMetricLabel(metric)}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Schedule Frequency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Schedule Frequency
            </label>
            <select
              value={scheduleFrequency}
              onChange={(e) => setScheduleFrequency(e.target.value as any)}
              className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg"
            >
              <option value="none">One-time report</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={() => onGenerate({ metrics: selectedMetrics, schedule: scheduleFrequency })}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
          >
            Generate Report
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============================================
// Helper Functions
// ============================================

function getMetricLabel(metric: MetricType): string {
  const labels: Record<MetricType, string> = {
    decisions: 'Authorization Decisions',
    resources: 'Resource Access',
    users: 'User Activity',
    denials: 'Access Denials',
    clearance: 'By Clearance Level',
    country: 'By Country',
    coi: 'By Community of Interest',
  };
  return labels[metric] || metric;
}

function generateMockData(metric: MetricType, timeRange: TimeRange, filters: DrillDownFilter[]): AnalyticsData[] {
  // Mock data generation - would be replaced with actual API call
  if (timeRange === '24h') {
    return Array.from({ length: 24 }, (_, i) => ({
      label: `${i}:00`,
      value: Math.floor(Math.random() * 100) + 50,
    }));
  }

  if (metric === 'clearance') {
    return [
      { label: 'UNCLASSIFIED', value: 450 },
      { label: 'CONFIDENTIAL', value: 230 },
      { label: 'SECRET', value: 120 },
      { label: 'TOP_SECRET', value: 45 },
    ];
  }

  if (metric === 'country') {
    return [
      { label: 'USA', value: 520 },
      { label: 'GBR', value: 340 },
      { label: 'FRA', value: 280 },
      { label: 'CAN', value: 180 },
      { label: 'DEU', value: 150 },
    ];
  }

  const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
  return Array.from({ length: days }, (_, i) => ({
    label: `Day ${i + 1}`,
    value: Math.floor(Math.random() * 200) + 100,
  }));
}
