'use client';
import {useEffect,useState} from 'react';
/** Server-rendered public forms remain inert until their protected submit handler is ready. */
export function useSecureFormReady(){const [ready,setReady]=useState(false);useEffect(()=>setReady(true),[]);return ready}
