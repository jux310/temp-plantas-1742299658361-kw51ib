import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { differenceInDays } from 'date-fns';

export interface Issue {
  id: string;
  work_order_id: string;
  title: string;
  notes?: string;
  issue_notes?: IssueNote[];
  delay?: IssueDelay | null;
  stage?: string | null;
  status: 'OPEN' | 'RESOLVED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
}

export interface IssueNote {
  id: string;
  issue_id: string;
  content: string;
  created_at: string;
  created_by: string;
  user_email?: string;
}

export interface IssueDelay {
  start_date: string;
  end_date: string | null;
}

export function useIssues(workOrders: any[]) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (workOrders) {
      loadIssues();
    }
  }, [workOrders]);

  const loadIssues = async () => {
    try {
      setError(null);
      if (!workOrders || workOrders.length === 0) {
        setIssues([]);
        setLoading(false);
        return;
      }

      const workOrderIds = workOrders
        .filter(wo => wo && typeof wo === 'object' && 'id' in wo)
        .map(wo => wo.id)
        .filter(Boolean);

      if (workOrderIds.length === 0) {
        setIssues([]);
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('issues')
        .select('*')
        .in('work_order_id', workOrderIds)
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('Error fetching issues:', fetchError);
        setError('Error al cargar los problemas');
        setIssues([]);
        return;
      }

      if (!data) {
        setIssues([]);
        return;
      }

      const notesPromise = supabase
        .from('issue_notes_with_users')
        .select()
        .in('issue_id', data.map(i => i.id))
        .order('created_at', { ascending: true });

      const delaysPromise = supabase
        .from('issue_delays')
        .select()
        .in('issue_id', data.map(i => i.id))
        .order('start_date', { ascending: true });

      const [notesResponse, delaysResponse] = await Promise.all([
        notesPromise,
        delaysPromise
      ]);

      const notes = notesResponse.error ? [] : (notesResponse.data || []);
      const delays = delaysResponse.error ? [] : (delaysResponse.data || []);

      const issuesWithData = data.map(issue => ({
        ...issue,
        issue_notes: notes.filter(n => n.issue_id === issue.id),
        delay: delays.find(d => d.issue_id === issue.id)
          ? {
              start_date: delays.find(d => d.issue_id === issue.id)!.start_date,
              end_date: delays.find(d => d.issue_id === issue.id)!.end_date
            }
          : null
      }));

      setIssues(issuesWithData);
    } catch (error) {
      console.error('Error in loadIssues:', error);
      setError(error instanceof Error ? error.message : 'Error al cargar los problemas');
      setIssues([]);
    } finally {
      setLoading(false);
    }
  };

  const addIssueNote = async (issueId: string, content: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');

      const { data, error } = await supabase
        .from('issue_notes')
        .insert({
          issue_id: issueId,
          content,
          created_by: user.id
        })
        .select('*')
        .single();

      if (error) throw error;

      const { data: noteWithUser } = await supabase
        .from('issue_notes_with_users')
        .select('*')
        .eq('id', data.id)
        .single();

      setIssues(prev => prev.map(issue => 
        issue.id === issueId
          ? {
              ...issue,
              issue_notes: [...(issue.issue_notes || []), noteWithUser]
            }
          : issue
      ));

      return noteWithUser;
    } catch (error) {
      console.error('Error adding issue note:', error);
      throw error;
    }
  };

  const createIssue = async (issue: Omit<Issue, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');

      const { data, error } = await supabase
        .from('issues')
        .insert({
          ...issue,
          created_by: user.id,
          updated_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      if (issue.notes?.trim()) {
        const { error: noteError } = await supabase
          .from('issue_notes')
          .insert({
            issue_id: data.id,
            content: issue.notes,
            created_by: user.id
          });

        if (noteError) throw noteError;
      }
      
      setIssues(prev => [data, ...prev]);
      return data;
    } catch (error) {
      console.error('Error creating issue:', error);
      throw error;
    }
  };

  const updateIssue = async (id: string, updates: Partial<Issue>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');

      if (updates.delay !== undefined) {
        const { data: currentIssue } = await supabase
          .from('issues')
          .select('priority, issue_delays (*)')
          .eq('id', id)
          .single();

        if (currentIssue && updates.delay && currentIssue.priority !== 'HIGH' && currentIssue.priority !== 'CRITICAL') {
          throw new Error('Solo se pueden agregar demoras a problemas de prioridad alta o crítica');
        }

        if (updates.delay) {
          const { data: existingDelay } = await supabase
            .from('issue_delays')
            .select('id')
            .eq('issue_id', id)
            .single();

          if (existingDelay) {
            const { error: updateError } = await supabase
              .from('issue_delays')
              .update({
                start_date: updates.delay.start_date,
                end_date: updates.delay.end_date,
                updated_by: user.id
              })
              .eq('id', existingDelay.id);

            if (updateError) throw updateError;
          } else {
            const { error: insertError } = await supabase
              .from('issue_delays')
              .insert({
                issue_id: id,
                start_date: updates.delay.start_date,
                end_date: updates.delay.end_date,
                created_by: user.id,
                updated_by: user.id
              });

            if (insertError) throw insertError;
          }
        } else {
          const { error: deleteError } = await supabase
            .from('issue_delays')
            .delete()
            .eq('issue_id', id);

          if (deleteError) throw deleteError;
        }

        delete updates.delay;
      }

      if (updates.notes?.trim()) {
        const { error: noteError } = await supabase
          .from('issue_notes')
          .insert({
            issue_id: id,
            content: updates.notes,
            created_by: user.id
          });

        if (noteError) throw noteError;
        delete updates.notes;
      }

      if (Object.keys(updates).length > 0) {
        const { data, error } = await supabase
          .from('issues')
          .update({ ...updates, updated_by: user.id })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        setIssues(prev => prev.map(issue => 
          issue.id === id ? { ...issue, ...data } : issue
        ));

        return data;
      }

      await loadIssues();
      return null;
    } catch (error) {
      console.error('Error updating issue:', error);
      throw error instanceof Error 
        ? new Error(`Error updating issue: ${error.message}`)
        : new Error('Error updating issue');
    }
  };

  return {
    issues,
    loading,
    error,
    createIssue,
    updateIssue,
    addIssueNote,
  };
}