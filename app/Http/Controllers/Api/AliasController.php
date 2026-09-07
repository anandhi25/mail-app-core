<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAliasRequest;
use App\Http\Requests\UpdateAliasRequest;
use App\Models\Alias;
use App\Models\Domain;
use Illuminate\Http\JsonResponse;

class AliasController extends Controller
{
    public function index(Domain $domain): JsonResponse
    {
        return response()->json($domain->aliases);
    }

    public function store(StoreAliasRequest $request, Domain $domain): JsonResponse
    {
        $alias = $domain->aliases()->create($request->validated());
        return response()->json($alias, 201);
    }

    public function show(Alias $alias): JsonResponse
    {
        return response()->json($alias);
    }

    public function update(UpdateAliasRequest $request, Alias $alias): JsonResponse
    {
        $alias->update($request->validated());
        return response()->json($alias);
    }

    public function destroy(Alias $alias): JsonResponse
    {
        $alias->delete();
        return response()->json(null, 204);
    }
}
