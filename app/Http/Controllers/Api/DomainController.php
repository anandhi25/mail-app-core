<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreDomainRequest;
use App\Http\Requests\UpdateDomainRequest;
use App\Models\Domain;
use Illuminate\Http\JsonResponse;

class DomainController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(Domain::all());
    }

    public function store(StoreDomainRequest $request): JsonResponse
    {
        $domain = Domain::create($request->validated());
        return response()->json($domain, 201);
    }

    public function show(Domain $domain): JsonResponse
    {
        return response()->json($domain->load(['mailUsers', 'aliases']));
    }

    public function update(UpdateDomainRequest $request, Domain $domain): JsonResponse
    {
        $domain->update($request->validated());
        return response()->json($domain);
    }

    public function destroy(Domain $domain): JsonResponse
    {
        $domain->delete();
        return response()->json(null, 204);
    }
}
