/**
 * Pagination Component
 * 
 * Handles pagination for resource list with:
 * - Page navigation (Previous/Next)
 * - Per-page selection (25/50/100/All)
 * - Jump to page
 * - Results summary
 */

'use client';

import React, { useState } from 'react';

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    onPageChange: (page: number) => void;
    onItemsPerPageChange: (itemsPerPage: number) => void;
}

export default function Pagination({
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    onPageChange,
    onItemsPerPageChange,
}: PaginationProps) {
    const [jumpToPage, setJumpToPage] = useState('');

    const handleJumpToPage = () => {
        const page = parseInt(jumpToPage, 10);
        if (page >= 1 && page <= totalPages) {
            onPageChange(page);
            setJumpToPage('');
        }
    };

    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

    return (
        <div className="bg-white border-t border-gray-200 px-6 py-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                {/* Results Summary */}
                <div className="text-sm text-gray-700">
                    Showing <span className="font-medium">{startItem}</span> to{' '}
                    <span className="font-medium">{endItem}</span> of{' '}
                    <span className="font-medium">{totalItems}</span> resources
                </div>

                {/* Pagination Controls */}
                <div className="flex items-center gap-4">
                    {/* Per Page Selector */}
                    <div className="flex items-center gap-2">
                        <label htmlFor="perPage" className="text-sm text-gray-700">
                            Per page:
                        </label>
                        <select
                            id="perPage"
                            value={itemsPerPage}
                            onChange={(e) => onItemsPerPageChange(parseInt(e.target.value, 10))}
                            className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                            <option value={totalItems}>All</option>
                        </select>
                    </div>

                    {/* Page Navigation */}
                    {totalPages > 1 && (
                        <>
                            <div className="flex items-center gap-2">
                                {/* Previous Button */}
                                <button
                                    onClick={() => onPageChange(currentPage - 1)}
                                    disabled={currentPage === 1}
                                    className={`px-3 py-1 text-sm font-medium rounded-md ${
                                        currentPage === 1
                                            ? 'text-gray-400 cursor-not-allowed'
                                            : 'text-blue-600 hover:bg-blue-50'
                                    }`}
                                >
                                    ← Previous
                                </button>

                                {/* Page Indicator */}
                                <span className="text-sm text-gray-700 px-2">
                                    Page <span className="font-medium">{currentPage}</span> of{' '}
                                    <span className="font-medium">{totalPages}</span>
                                </span>

                                {/* Next Button */}
                                <button
                                    onClick={() => onPageChange(currentPage + 1)}
                                    disabled={currentPage === totalPages}
                                    className={`px-3 py-1 text-sm font-medium rounded-md ${
                                        currentPage === totalPages
                                            ? 'text-gray-400 cursor-not-allowed'
                                            : 'text-blue-600 hover:bg-blue-50'
                                    }`}
                                >
                                    Next →
                                </button>
                            </div>

                            {/* Jump to Page */}
                            <div className="flex items-center gap-2 ml-4 pl-4 border-l border-gray-300">
                                <label htmlFor="jumpTo" className="text-sm text-gray-700">
                                    Jump to:
                                </label>
                                <input
                                    id="jumpTo"
                                    type="number"
                                    min="1"
                                    max={totalPages}
                                    value={jumpToPage}
                                    onChange={(e) => setJumpToPage(e.target.value)}
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                            handleJumpToPage();
                                        }
                                    }}
                                    placeholder={currentPage.toString()}
                                    className="w-16 px-2 py-1 border border-gray-300 rounded-md text-sm text-center focus:ring-blue-500 focus:border-blue-500"
                                />
                                <button
                                    onClick={handleJumpToPage}
                                    className="px-3 py-1 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                                >
                                    Go
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
