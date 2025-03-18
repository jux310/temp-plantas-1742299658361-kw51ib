import React, { useRef, useEffect } from 'react';
import { DateCell } from './DateCell';
import { WorkOrder, Stage } from '../types';
import { useIssues } from '../hooks/useIssues';
import { differenceInDays } from 'date-fns';

function TruncatedDescription({ text }: { text: string }) {
  return (
    <div className="group relative">
      <div className="truncate max-w-[100px]">
        {text}
      </div>
      {text && (
        <div className="absolute z-10 invisible group-hover:visible bg-gray-900 text-white p-2 rounded shadow-lg max-w-sm whitespace-normal break-words left-0 mt-1">
          {text}
        </div>
      )}
    </div>
  );
}

interface WorkOrderTableProps {
  workOrders: WorkOrder[];
  stages: Stage[];
  onDateChange: (ot: string, stage: string, date: string, confirmed: boolean) => void;
  isArchived?: boolean;
}

export function WorkOrderTable({
  workOrders,
  stages,
  onDateChange,
  isArchived = false,
}: WorkOrderTableProps) {
  const { issues } = useIssues(workOrders);
  
  // Sort work orders by progress in descending order
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sortedWorkOrders = [...workOrders].sort((a, b) => b.progress - a.progress);

  const getStageIssues = (workOrderId: string, stageName: string) => {
    return issues.some(issue => 
      issue.work_order_id === workOrderId && 
      issue.stage === stageName && 
      issue.status === 'OPEN'
    );
  };

  const calculateTotalDelay = (workOrderId: string) => {
    const workOrderIssues = issues.filter(issue => issue.work_order_id === workOrderId);
    let totalDays = 0;

    workOrderIssues.forEach(issue => {
      if (issue.delay) {
        const startDate = new Date(issue.delay.start_date);
        const endDate = issue.delay.end_date ? new Date(issue.delay.end_date) : new Date();
        totalDays += differenceInDays(endDate, startDate) + 1;
      }
    });

    return totalDays;
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <div ref={scrollContainerRef} className="overflow-x-auto h-[calc(100vh-16rem)] smooth-scroll">
      <table className="min-w-full bg-white shadow-sm rounded-lg">
        <thead className="bg-gray-50 sticky top-0 z-10">
          <tr>
            <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">OT</th>
            <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">Cliente</th>
            <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">Descripción</th>
            <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">TAG</th>
            {!isArchived && (
              <>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">Status</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">Avance</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">Retraso</th>
              </>
            )}
            {stages.map((stage) => (
              <th key={`header-${stage.name}`} className="px-4 py-2 text-left text-sm font-semibold text-gray-600">
                {stage.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 overflow-y-auto">
          {sortedWorkOrders.map((wo) => (
            <tr key={wo.ot} className="hover:bg-gray-50">
              <td className="px-4 py-2">{wo.ot}</td>
              <td className="px-4 py-2">{wo.client}</td>
              <td className="px-4 py-2">
                <TruncatedDescription text={wo.description} />
              </td>
              <td className="px-4 py-2 whitespace-nowrap">{wo.tag}</td>
              {!isArchived && (
                <>
                  <td className="px-4 py-2">{wo.status}</td>
                  <td className="px-4 py-2">{wo.progress}%</td>
                  <td className="px-4 py-2">
                    <span className="whitespace-nowrap">{calculateTotalDelay(wo.id) > 0 ? `${calculateTotalDelay(wo.id)} días` : '-'}</span>
                  </td>
                </>
              )}
              {stages.map((stage) => (
                <td key={`${wo.ot}-${stage.name}`} className="px-4 py-2">
                  <DateCell
                    date={wo.dates[stage.name] || null}
                    workOrderOt={wo.ot}
                    stageName={stage.name}
                    hasIssues={getStageIssues(wo.id, stage.name)}
                    workOrderId={wo.id}
                    onDateChange={(date, confirmed) => onDateChange(wo.ot, stage.name, date, confirmed)}
                    disabled={isArchived}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}